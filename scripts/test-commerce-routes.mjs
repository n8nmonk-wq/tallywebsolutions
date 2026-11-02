import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { load, check, finish } from './test-commerce.mjs';

process.env.DOWNLOAD_SECRET = 'offline-commerce-secret';
const token = load('src/lib/token.ts');
const order = { id: 'order_1', email: 'reader@example.com', name: 'Reader Name', status: 'paid', total: 100, items: [{ slug: 'book-a', title: 'Book', price: 100, file_url: 'private:book.pdf', file_format: 'PDF' }] };
const deniedDb = { sql: () => { throw new Error('Unexpected database write'); }, getOrder: async () => order, getBook: async () => ({ slug: 'book-a', file_url: 'private:book.pdf' }), logEvent: async () => {} };
await check('valid token still requires reader authorization', async () => {
  const route = load('src/app/api/download/route.ts', {
    '@/lib/db': deniedDb,
    '@/lib/reader-auth': { canAccessOrder: async () => false },
  });
  const response = await route.GET(new Request(`https://example.com/api/download?t=${token.mintDownloadToken('order_1', 'book-a')}`));
  assert.equal(response.status, 403);
});
await check('checkout disabled before any database/provider call', async () => {
  delete process.env.COMMERCE_ENABLED;
  const route = load('src/app/api/checkout/route.ts', {
    '@/lib/db': deniedDb,
    './db': deniedDb,
    '@/lib/fulfil': { fulfilOrder: async () => { throw new Error('Unexpected fulfilment'); } },
    '@/lib/catalogue': { isSaleable: () => true },
    '@/lib/reader-auth': { checkOrigin: () => true, getReader: async () => null, grantGuestOrder: async () => {} },
  });
  const response = await route.POST(new Request('https://example.com/api/checkout', { method: 'POST', body: JSON.stringify({ slug: 'book-a', name: 'Reader Name', email: 'reader@example.com', phone: '9876543210' }) }));
  assert.equal(response.status, 503);
});
const forbidden = () => { throw new Error('Unexpected database/provider call'); };
const boundaries = {
  '@/lib/db': deniedDb, './db': deniedDb,
  '@/lib/fulfil': { fulfilOrder: forbidden },
  '@/lib/settle': { settleFromRazorpay: forbidden },
  '@/lib/reader-auth': { checkOrigin: () => true, getReader: forbidden, canAccessOrder: forbidden },
};
const checkout = load('src/app/api/checkout/route.ts', {
  ...boundaries,
  '@/lib/razorpay': { checkoutConfiguration: () => ({ dev: false, site: 'https://example.com' }), createPaymentLink: forbidden },
});
process.env.RAZORPAY_WEBHOOK_SECRET = 'offline-webhook-secret';
const webhook = load('src/app/api/webhook/route.ts', boundaries);
for (const [name, route, limit] of [['checkout', checkout, 16384], ['webhook', webhook, 262144]]) {
  await check(`${name} rejects a declared oversized body without reading any bytes`, async () => {
    let pulls = 0;
    const stream = new ReadableStream({ pull(controller) { pulls++; controller.close(); } }, { highWaterMark: 0 });
    const response = await route.POST(new Request(`https://example.com/api/${name}`, {
      method: 'POST', body: stream, duplex: 'half', headers: { 'content-length': String(limit + 1) },
    }));
    assert.equal(response.status, 413);
    assert.equal(pulls, 0);
  });
  for (const headers of [{}, { 'content-length': '1' }]) {
    await check(`${name} cancels oversized streams before reading the tail, regardless of content-length`, async () => {
      let pulls = 0, cancelled = false;
      const stream = new ReadableStream({
        pull(controller) {
          pulls++;
          controller.enqueue(new Uint8Array(pulls === 1 ? limit : pulls === 2 ? 1 : 1024).fill(32));
          if (pulls === 3) controller.close();
        },
        cancel() { cancelled = true; },
      }, { highWaterMark: 0 });
      const response = await route.POST(new Request(`https://example.com/api/${name}`, { method: 'POST', body: stream, duplex: 'half', headers }));
      assert.equal(response.status, 413);
      assert.equal(pulls, 2, 'Do not buffer the remainder after crossing the limit');
      assert.equal(cancelled, true);
    });
  }
  await check(`${name} limits UTF-8 bytes rather than character count`, async () => {
    const raw = JSON.stringify({ event: 'ignored', padding: '\u00e9'.repeat(limit / 2) });
    assert.ok(raw.length < limit && Buffer.byteLength(raw) > limit);
    const response = await route.POST(new Request(`https://example.com/api/${name}`, { method: 'POST', body: raw }));
    assert.equal(response.status, 413);
  });
}
await check('checkout accepts the exact byte limit and still validates the request before database access', async () => {
  const prefix = '{"slugs":[],"padding":"';
  const suffix = '"}';
  const raw = prefix + ' '.repeat(16384 - Buffer.byteLength(prefix + suffix)) + suffix;
  const response = await checkout.POST(new Request('https://example.com/api/checkout', {
    method: 'POST', body: raw, headers: { 'idempotency-key': 'checkout-boundary001' },
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /distinct books/i);
});
await check('webhook verifies exact raw UTF-8 across chunks at its byte limit', async () => {
  const prefix = ' \n{"event":"ignored","text":"\u00e9", "padding":"';
  const suffix = '"}\n';
  const raw = prefix + ' '.repeat(262144 - Buffer.byteLength(prefix + suffix)) + suffix;
  const bytes = Buffer.from(raw);
  const split = bytes.indexOf(0xc3) + 1;
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  for (const mac of [signature, '0'.repeat(64)]) {
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(bytes.subarray(0, split));
      controller.enqueue(bytes.subarray(split));
      controller.close();
    } });
    const response = await webhook.POST(new Request('https://example.com/api/webhook', {
      method: 'POST', body: stream, duplex: 'half', headers: { 'x-razorpay-signature': mac },
    }));
    assert.equal(response.status, mac === signature ? 200 : 400);
  }
});
await check('checkout and webhook error logs exclude raw provider/database errors', async () => {
  const sensitive = new Error('PRIVATE reader@example.com provider-token database-password');
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    const body = { slug: 'book-a', name: 'Reader Name', email: 'reader@example.com', phone: '9876543210' };
    const req = () => new Request('https://example.com/api/checkout', { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': 'checkout-redacted001' } });
    const configuration = { checkoutConfiguration: () => ({ dev: false, site: 'https://example.com' }), createPaymentLink: async () => { throw sensitive; }, PaymentLinkCreationRejected: class extends Error {} };
    const failedRead = load('src/app/api/checkout/route.ts', {
      ...boundaries, '@/lib/razorpay': configuration,
      '@/lib/reader-auth': { checkOrigin: () => true, getReader: async () => { throw sensitive; } },
    });
    assert.equal((await failedRead.POST(req())).status, 503);
    const saved = { ...order, status: 'created', payment_url: null, is_dev: false,
      checkout_hash: crypto.createHash('sha256').update(JSON.stringify({ slugs: ['book-a'], name: body.name, email: body.email, phone: '+919876543210', reader: null })).digest('hex') };
    const failedCreate = load('src/app/api/checkout/route.ts', {
      ...boundaries, '@/lib/razorpay': configuration,
      '@/lib/db': { ...deniedDb, sql: async parts => parts.join('?').includes('select * from orders') ? [saved] : [{ order_id: saved.id }] },
      '@/lib/reader-auth': { checkOrigin: () => true, getReader: async () => null, canAccessOrder: async () => true },
    });
    assert.equal((await failedCreate.POST(req())).status, 202);
    const failedWebhook = load('src/app/api/webhook/route.ts', {
      ...boundaries, '@/lib/db': { ...deniedDb, sql: async () => { throw sensitive; } },
    });
    const raw = JSON.stringify({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: 'plink_1', reference_id: order.id } } } });
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
    assert.equal((await failedWebhook.POST(new Request('https://example.com/api/webhook', {
      method: 'POST', body: raw, headers: { 'x-razorpay-signature': signature },
    }))).status, 503);
    assert.equal(logs.length, 3);
    assert.ok(logs.every(args => args.every(arg => typeof arg === 'string')));
    assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
    assert.ok(!JSON.stringify(logs).includes('reader@example.com'));
  } finally { console.error = originalError; }
});
await check('email rejection leaves retryable fulfilled entitlements', async () => {
  let sent = 0;
  const db = { getOrder: async () => order, logEvent: async () => {}, sql: async (parts) => {
    const query = parts.join('?');
    if (query.includes('select * from orders')) return [order];
    if (query.includes('with paid')) return [{ id: order.id }];
    if (query.includes('update email_delivery') && query.includes('returning')) return [{ payload: { to: order.email, subject: 'Ready', html: 'Ready' } }];
    return [{ id: order.id }];
  } };
  const fulfil = load('src/lib/fulfil.ts', {
    './db': db,
    './razorpay': { verifyPaymentForOrder: async () => ({ id: 'pay_1', amount_refunded: 0 }) },
    './email': { confirmationPayload: () => ({ to: order.email, subject: 'Ready', html: 'Ready' }), sendEmail: async () => { sent++; throw new Error('Mail unavailable'); }, orderConfirmation: async () => { sent++; throw new Error('Mail unavailable'); } },
  });
  await assert.rejects(() => fulfil.fulfilOrder('plink_1', 'pay_1'));
  assert.equal(sent, 1, 'already-paid orders must retry delivery');
});
finish();
