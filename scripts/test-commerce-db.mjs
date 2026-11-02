// In-memory Postgres engine only. Never reads .env.local or connects to production.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PDFDocument } from 'pdf-lib';
import crypto from 'node:crypto';
import { load, check, finish } from './test-commerce.mjs';

const database = new PGlite();
await database.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
await database.exec(readFileSync(new URL('../migrations/002-commerce.sql', import.meta.url), 'utf8'));
await database.exec(readFileSync(new URL('../migrations/008-offers.sql', import.meta.url), 'utf8'));
const sql = async (parts, ...parameters) => (await database.query(parts.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), parameters)).rows;
const getOrder = async id => (await sql`select * from orders where id = ${id}`)[0] || null;
const books = new Map([
  ['book-a', { slug: 'book-a', title: '<Book A>', price_inr: 19900, active: true, file_url: 'https://files.example.com/book.pdf', file_format: 'PDF', edition: 'First', release_approved: true, scan_status: 'clean' }],
  ['book-b', { slug: 'book-b', title: 'Book B', price_inr: 29900, active: true, file_url: 'https://files.example.com/book.epub', file_format: 'EPUB', edition: 'Second', release_approved: true, scan_status: 'clean' }],
]);
const db = { sql, getOrder, getBook: async slug => books.get(slug) || null, logEvent: async () => {} };
let authorized = true;
const readerAuth = { checkOrigin: req => req.headers.get('origin') === 'https://example.com', getReader: async () => ({ id: 'reader1', email: 'reader@example.com', name: 'Reader Name' }), canAccessOrder: async () => authorized, grantGuestOrder: async () => {} };
let liveOffers = [];
const offerData = { loadOffers: async () => liveOffers, customerHistory: async () => ({ paidOrders: 0, uses: {} }),
  cartLines: async (list, now) => list.map((b) => { const p = load('src/lib/money.ts').currentPrice(b, now); return { slug: b.slug, price: p.price, regular: p.regular, categories: [], collections: [] }; }) };
let blobReads = 0;
const mocks = { '@/lib/offer-data': offerData, './db': db, '@/lib/db': db, '@/lib/reader-auth': readerAuth, '@vercel/blob': { get: async (_url, options) => {
  assert.equal(options.access, 'private');
  assert.equal(options.useCache, false);
  blobReads++;
  return { statusCode: 200, stream: new Response(pdfBytes).body, blob: { size: pdfBytes.length } };
} } };
Object.assign(process.env, { NODE_ENV: 'production', COMMERCE_ENABLED: 'true', COMMERCE_POLICIES_APPROVED: 'true', LEGAL_ENTITY_NAME: 'Offline Test Publisher Pvt Ltd', LEGAL_ENTITY_ADDRESS: '42 Fixture Street, Mumbai 400001', SUPPORT_EMAIL: 'support@store-test.invalid', AUTH_SECRET: 'offline-auth-secret-at-least-32-characters', DATABASE_URL: 'never-used-by-tests', DOWNLOAD_SECRET: 'offline-download-secret-at-least-32-characters', RAZORPAY_KEY_ID: 'rzp_test_offline', RAZORPAY_KEY_SECRET: 'offline', RAZORPAY_WEBHOOK_SECRET: 'offline', RESEND_API_KEY: 'offline', MAIL_FROM: 'Books <books@example.com>', NEXT_PUBLIC_SITE_URL: 'https://example.com', CRON_SECRET: 'offline-cron', BOOK_STORAGE_ALLOWED_HOSTS: 'files.example.com' });
const originalFetch = globalThis.fetch;
const links = new Map();
const payments = new Map();
let creations = 0, emailSends = 0, failCreate = false, failEmail = false, badPdf = false;
let rejectedCreate = false, lookupResponse, lookupPause;
let fetchFileUrl;
let lastEmail;
const pdf = await PDFDocument.create();
pdf.addPage([400, 600]);
const pdfBytes = await pdf.save();
const pdfHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
const changedPdf = await PDFDocument.create();
changedPdf.addPage([500, 700]);
const changedPdfBytes = await changedPdf.save();
let servedPdfBytes = pdfBytes;
for (const book of books.values()) book.file_sha256 = pdfHash;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url === 'https://api.razorpay.com/v1/payment_links' && options.method === 'POST') {
    const body = JSON.parse(options.body);
    assert.ok(await getOrder(body.reference_id), 'provider creation requires a persisted order');
    creations++;
    if (rejectedCreate) return typeof rejectedCreate === 'function' ? rejectedCreate() : Response.json({ error: { code: 'BAD_REQUEST_ERROR', description: 'Invalid creation request' } }, { status: 400 });
    const link = { id: `plink_${creations}`, short_url: `https://rzp.io/i/${creations}`, reference_id: body.reference_id, amount: body.amount, amount_paid: 0, currency: 'INR', status: 'created', payments: [] };
    links.set(link.id, link);
    if (failCreate) throw new Error('Ambiguous provider timeout');
    return Response.json(link);
  }
  if (url.startsWith('https://api.razorpay.com/v1/payment_links?')) {
    assert.equal(options.headers.authorization, 'Basic ' + Buffer.from('rzp_test_offline:offline').toString('base64'));
    if (lookupPause) { const pause = lookupPause; lookupPause = null; await pause; }
    if (lookupResponse) return lookupResponse();
    const ref = new URL(url).searchParams.get('reference_id');
    // Razorpay documents a single entity when fetched by reference_id.
    return Response.json([...links.values()].find(l => l.reference_id === ref) || { payment_links: [] });
  }
  if (url.startsWith('https://api.razorpay.com/v1/payment_links/')) return Response.json(links.get(url.split('/').at(-1)));
  if (url.startsWith('https://api.razorpay.com/v1/payments/')) return Response.json(payments.get(url.split('/').at(-1)));
  if (url === 'https://api.resend.com/emails') {
    lastEmail = { ...JSON.parse(options.body), key: options.headers['Idempotency-Key'] };
    if (failEmail) return Response.json({ error: 'Unavailable' }, { status: 503 });
    emailSends++;
    return Response.json({ id: `mail_${emailSends}` });
  }
  if (url.startsWith('https://files.example.com/')) {
    fetchFileUrl = url;
    return new Response(badPdf ? new Uint8Array([1, 2]) : servedPdfBytes);
  }
  throw new Error(`Forbidden network request: ${url}`);
};
const checkout = load('src/app/api/checkout/route.ts', mocks);
const fulfil = load('src/lib/fulfil.ts', mocks);
const settle = load('src/lib/settle.ts', mocks);
const download = load('src/app/api/download/route.ts', mocks);
const razorpay = load('src/lib/razorpay.ts', mocks);
const token = load('src/lib/token.ts', mocks);
const webhook = load('src/app/api/webhook/route.ts', mocks);
const cron = load('src/app/api/cron/reconcile/route.ts', mocks);
const request = (key, overrides = {}, headers = {}) => new Request('https://example.com/api/checkout', {
  method: 'POST', headers: { origin: 'https://example.com', 'idempotency-key': key, ...headers },
  body: JSON.stringify({ slugs: ['book-a', 'book-b'], name: 'Reader Name', email: 'reader@example.com', phone: '9876543210', ...overrides }),
});
let mainId;
try {
  await check('migration is additive and rerunnable', async () => { await database.exec(readFileSync(new URL('../migrations/002-commerce.sql', import.meta.url), 'utf8')); });
  await check('payment recovery migration is rerunnable and bounds attempts without resetting unknown claims', async () => {
    await sql`insert into orders(id,email,subtotal,total) values('migration-unknown','migration@example.com',100,100)`;
    await sql`insert into payment_attempts(order_id,state) values('migration-unknown','unknown')`;
    const migration = readFileSync(new URL('../migrations/006-payment-recovery.sql', import.meta.url), 'utf8');
    await database.exec(migration);
    await database.exec(migration);
    assert.deepEqual((await sql`select state,attempts from payment_attempts where order_id='migration-unknown'`)[0], { state: 'unknown', attempts: 1 });
    await assert.rejects(() => sql`update payment_attempts set attempts=4 where order_id='migration-unknown'`);
  });
  await check('checkout persists server prices and asset edition snapshots', async () => {
    const response = await checkout.POST(request('checkout-main-0001', { total: 1 }));
    assert.equal(response.status, 200);
    mainId = (await response.json()).orderId;
    const order = await getOrder(mainId);
    assert.equal(order.total, 49800);
    assert.equal(order.items[0].file_url, 'https://files.example.com/book.pdf');
    assert.equal(order.items[0].edition, 'First');
    assert.equal(order.items[0].file_sha256, pdfHash);
    assert.equal(order.reader_id, 'reader1');
  });
  await check('checkout charges the sale price only inside its window and snapshots the regular price', async () => {
    const a = books.get('book-a');
    Object.assign(a, { sale_price_inr: 15900, sale_starts_at: new Date(Date.now() - 60000).toISOString(), sale_ends_at: new Date(Date.now() + 3600000).toISOString() });
    try {
      const inWindow = await checkout.POST(request('checkout-sale-0001', { slugs: ['book-a'] }));
      assert.equal(inWindow.status, 200);
      const order = await getOrder((await inWindow.json()).orderId);
      assert.equal(order.total, 15900);
      assert.equal(order.items[0].price, 15900);
      assert.equal(order.items[0].list_price, 19900);
      a.sale_ends_at = new Date(Date.now() - 1).toISOString();
      const retried = await checkout.POST(request('checkout-sale-0001', { slugs: ['book-a'] }));
      assert.equal((await getOrder((await retried.json()).orderId)).total, 15900, 'a retry keeps the snapshot price');
      const after = await checkout.POST(request('checkout-sale-0002', { slugs: ['book-a'] }));
      assert.equal((await getOrder((await after.json()).orderId)).total, 19900, 'expired sale charges the regular price');
    } finally { delete a.sale_price_inr; delete a.sale_starts_at; delete a.sale_ends_at; }
  });
  await check('same checkout key creates no second payment link', async () => {
    const before = creations;
    const responses = await Promise.all([checkout.POST(request('checkout-main-0001')), checkout.POST(request('checkout-main-0001'))]);
    for (const response of responses) assert.equal((await response.json()).orderId, mainId);
    assert.equal(creations, before);
  });
  await check('server, authentication, and malformed creation failures are never definitive rejections', async () => {
    try {
      for (const response of [
        () => Response.json({ error: { code: 'BAD_REQUEST_ERROR' } }, { status: 500 }),
        () => Response.json({ error: { code: 'BAD_REQUEST_ERROR' } }, { status: 401 }),
        () => new Response('Invalid JSON', { status: 400 }),
        () => Response.json({ error: {} }, { status: 400 }),
      ]) {
        rejectedCreate = response;
        await assert.rejects(() => razorpay.createPaymentLink({ amountPaise: 49800, orderId: mainId,
          name: 'Reader Name', email: 'reader@example.com', phone: '9876543210', description: 'Test', callbackUrl: 'https://example.com' }),
        error => !(error instanceof razorpay.PaymentLinkCreationRejected));
      }
    } finally { rejectedCreate = false; }
  });
  await check('simultaneous first checkouts create exactly one provider link', async () => {
    const before = creations;
    const responses = await Promise.all([checkout.POST(request('checkout-race-0001')), checkout.POST(request('checkout-race-0001'))]);
    const ids = await Promise.all(responses.map(r => r.json().then(j => j.orderId)));
    assert.equal(ids[0], ids[1]);
    assert.equal(creations, before + 1);
  });
  await check('same key different cart conflicts', async () => assert.equal((await checkout.POST(request('checkout-main-0001', { slugs: ['book-a'] }))).status, 409));
  await check('same key unauthorized reader does not disclose order', async () => {
    authorized = false;
    assert.equal((await checkout.POST(request('checkout-main-0001'))).status, 403);
    authorized = true;
  });
  await check('origin, key, cart, and customer shapes fail before provider', async () => {
    const before = creations;
    for (const [key, body, headers] of [['short', {}, {}], ['checkout-invalid01', { slugs: [] }, {}], ['checkout-invalid02', { slugs: Array(21).fill('book-a') }, {}], ['checkout-invalid03', { slugs: ['book-a', 'book-a'] }, {}], ['checkout-invalid04', { name: 5 }, {}], ['checkout-invalid05', {}, { origin: 'https://evil.example' }]]) {
      assert.ok((await checkout.POST(request(key, body, headers))).status >= 400);
    }
    assert.equal(creations, before);
  });
  await check('third-party titles require all release gates', async () => {
    const book = books.get('book-b');
    books.set('book-b', { ...book, third_party: true, rights_approved: false, commercial_approved: true });
    assert.equal((await checkout.POST(request('checkout-thirdparty01'))).status, 409);
    books.set('book-b', book);
  });
  await check('demo preview titles can never be bought', async () => {
    const book = books.get('book-b');
    const before = creations;
    books.set('book-b', { ...book, facts: { ...(book.facts || {}), _demo: 'true' } });
    assert.equal((await checkout.POST(request('checkout-demo-title01'))).status, 409);
    assert.equal(creations, before, 'no payment link for a demo title');
    books.set('book-b', book);
  });
  await check('new checkout rejects missing or malformed catalogue checksums before payment creation', async () => {
    const book = books.get('book-b');
    const before = creations;
    for (const [index, checksum] of [null, '', 'a'.repeat(63), 'g'.repeat(64), 'a'.repeat(65), 'a'.repeat(64) + '\n'].entries()) {
      books.set('book-b', { ...book, file_sha256: checksum });
      try { assert.equal((await checkout.POST(request(`checkout-hash-invalid-${index}`))).status, 503); }
      finally { books.set('book-b', book); }
    }
    assert.equal(creations, before);
  });
  await check('provider ambiguity remains persisted and retry creates no duplicate', async () => {
    failCreate = true;
    const response = await checkout.POST(request('checkout-ambiguous01'));
    assert.equal(response.status, 202);
    const id = (await response.json()).orderId;
    const before = creations;
    assert.equal((await checkout.POST(request('checkout-ambiguous01'))).status, 202);
    assert.equal(creations, before);
    failCreate = false;
    const storedLink = [...links.values()].find(l => l.reference_id === id);
    links.delete(storedLink.id);
    await settle.settleFromRazorpay(await getOrder(id));
    assert.equal((await sql`select state from payment_attempts where order_id=${id}`)[0].state, 'unknown');
    assert.equal((await checkout.POST(request('checkout-ambiguous01'))).status, 202);
    assert.equal(creations, before, 'An empty lookup must not release an ambiguous creation');
    links.set(storedLink.id, storedLink);
    await settle.settleFromRazorpay(await getOrder(id));
    assert.ok((await getOrder(id)).razorpay_link_id, 'reference lookup recovers ambiguous creation');
  });
  await check('definitive rejection requires authenticated valid absence before one bounded retry claim', async () => {
    rejectedCreate = true;
    let id;
    try {
      const first = await checkout.POST(request('checkout-rejected-001'));
      assert.equal(first.status, 202);
      id = (await first.json()).orderId;
      assert.equal((await sql`select state from payment_attempts where order_id=${id}`)[0].state, 'failed');
      const before = creations;
      assert.equal((await checkout.POST(request('checkout-rejected-001'))).status, 202);
      assert.equal(creations, before);
      for (const response of [
        () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
        () => Response.json({}),
        () => Response.json({ payment_links: [null] }),
        () => Response.json({ payment_links: [{ reference_id: 'another-order' }] }),
        () => Response.json({ payment_links: [], count: 1 }),
      ]) {
        lookupResponse = response;
        await assert.rejects(async () => settle.settleFromRazorpay(await getOrder(id)));
        assert.equal((await sql`select state from payment_attempts where order_id=${id}`)[0].state, 'failed');
      }
      lookupResponse = null;
      await settle.settleFromRazorpay(await getOrder(id));
      assert.equal((await sql`select state from payment_attempts where order_id=${id}`)[0].state, 'retryable');
      const replies = await Promise.all(Array.from({ length: 3 }, () => checkout.POST(request('checkout-rejected-001'))));
      assert.ok(replies.every(r => r.status === 202));
      assert.equal(creations, before + 1);
      assert.deepEqual((await sql`select state,attempts from payment_attempts where order_id=${id}`)[0], { state: 'failed', attempts: 2 });
      await settle.settleFromRazorpay(await getOrder(id));
      rejectedCreate = false;
      const final = await checkout.POST(request('checkout-rejected-001'));
      assert.equal(final.status, 200);
      assert.equal((await final.json()).orderId, id);
      assert.deepEqual((await sql`select state,attempts from payment_attempts where order_id=${id}`)[0], { state: 'ready', attempts: 3 });
    } finally { rejectedCreate = false; lookupResponse = null; }
  });
  await check('rejected creation with an existing provider link reconciles without creating another', async () => {
    rejectedCreate = true;
    try {
      const id = (await (await checkout.POST(request('checkout-existing001'))).json()).orderId;
      const found = { id: 'plink_existing', short_url: 'https://rzp.io/i/existing', reference_id: id,
        amount: 49800, amount_paid: 0, currency: 'INR', status: 'created', payments: [] };
      links.set(found.id, found);
      const before = creations;
      await settle.settleFromRazorpay(await getOrder(id));
      const response = await checkout.POST(request('checkout-existing001'));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).paymentUrl, found.short_url);
      assert.equal(creations, before);
      assert.equal((await sql`select state from payment_attempts where order_id=${id}`)[0].state, 'ready');
    } finally { rejectedCreate = false; }
  });
  await check('stale reconciliation cannot release a later rejection and retry exhaustion fails closed', async () => {
    rejectedCreate = true;
    try {
      const id = (await (await checkout.POST(request('checkout-exhausted001'))).json()).orderId;
      let release;
      lookupPause = new Promise(resolve => { release = resolve; });
      const stale = settle.settleFromRazorpay(await getOrder(id));
      // Let the first lookup capture the failed attempt before the second reconciliation.
      while (lookupPause) await new Promise(resolve => setImmediate(resolve));
      await settle.settleFromRazorpay(await getOrder(id));
      await checkout.POST(request('checkout-exhausted001'));
      release();
      await stale;
      assert.deepEqual((await sql`select state,attempts from payment_attempts where order_id=${id}`)[0], { state: 'failed', attempts: 2 });
      await settle.settleFromRazorpay(await getOrder(id));
      await checkout.POST(request('checkout-exhausted001'));
      const before = creations;
      await settle.settleFromRazorpay(await getOrder(id));
      assert.equal((await checkout.POST(request('checkout-exhausted001'))).status, 503);
      assert.equal(creations, before);
      assert.deepEqual((await sql`select state,attempts from payment_attempts where order_id=${id}`)[0], { state: 'failed', attempts: 3 });
    } finally { rejectedCreate = false; lookupPause = null; }
  });
  await check('persisted checkout interrupted before provider claim resumes safely', async () => {
    const saved = await getOrder(mainId);
    const response = await checkout.POST(request('checkout-resume-0001'));
    const id = (await response.json()).orderId;
    await sql`update orders set razorpay_order_id = null, razorpay_link_id = null, payment_url = null where id = ${id}`;
    await sql`delete from payment_attempts where order_id = ${id}`;
    const before = creations;
    const resumed = await checkout.POST(request('checkout-resume-0001'));
    assert.equal(resumed.status, 200);
    assert.equal(creations, before + 1);
    assert.equal((await resumed.json()).orderId, id);
    assert.equal(saved.total, 49800);
  });
  const order = await getOrder(mainId);
  const link = links.get(order.razorpay_link_id);
  link.status = 'paid'; link.amount_paid = order.total; link.payments = [{ payment_id: 'pay_1', status: 'captured' }];
  payments.set('pay_1', { id: 'pay_1', order_id: 'order_provider1', amount: order.total, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 });
  await check('provider wrong amount cannot grant entitlements', async () => {
    payments.get('pay_1').amount = 1;
    await assert.rejects(() => fulfil.fulfilOrder(link.id, 'pay_1'));
    assert.equal((await getOrder(mainId)).status, 'created');
    payments.get('pay_1').amount = order.total;
  });
  await check('provider currency, association, and capture state must match', async () => {
    const payment = payments.get('pay_1');
    for (const [field, invalid] of [['currency', 'USD'], ['captured', false], ['amount_refunded', -1], ['amount_refunded', 0.1], ['status', 'authorized']]) {
      const saved = payment[field];
      payment[field] = invalid;
      try { await assert.rejects(() => fulfil.fulfilOrder(link.id, 'pay_1')); }
      finally { payment[field] = saved; }
      assert.equal((await getOrder(mainId)).status, 'created');
    }
    await assert.rejects(() => fulfil.fulfilOrder(link.id, 'pay_unrelated'));
  });
  await check('mail failure leaves atomic entitlements and a retryable outbox', async () => {
    failEmail = true;
    await assert.rejects(() => fulfil.fulfilOrder(link.id, 'pay_1'));
    assert.equal((await getOrder(mainId)).status, 'fulfilled');
    assert.equal((await sql`select * from downloads where order_id = ${mainId}`).length, 2);
    assert.equal((await sql`select * from email_delivery where order_id = ${mainId}`)[0].state, 'pending');
    failEmail = false;
  });
  await check('paid replay repairs missing entitlements and retries email once', async () => {
    await sql`delete from downloads where order_id = ${mainId} and book_slug = 'book-b'`;
    await sql`update email_delivery set next_attempt_at = now() where order_id = ${mainId}`;
    const before = emailSends;
    await Promise.all([fulfil.fulfilOrder(link.id, 'pay_1'), fulfil.fulfilOrder(link.id, 'pay_1')]);
    assert.equal((await sql`select * from downloads where order_id = ${mainId}`).length, 2);
    assert.equal(emailSends, before + 1);
    assert.equal((await sql`select * from email_delivery where order_id = ${mainId}`)[0].state, 'sent');
    assert.equal(lastEmail.key, `order-confirmation/${mainId}`);
    assert.ok(lastEmail.html.includes('&lt;Book A&gt;'));
  });
  await check('email retry exhaustion and expired uncertain sends require manual review', async () => {
    for (const reason of ['exhausted', 'expired']) {
      await sql`update email_delivery set state = 'pending', attempts = ${reason === 'exhausted' ? 8 : 1}, first_attempt_at = now() - interval '25 hours', lease_until = null where order_id = ${mainId}`;
      const before = emailSends;
      assert.equal(await fulfil.retryOrderEmail(mainId), false);
      assert.equal(emailSends, before);
      assert.equal((await sql`select * from email_delivery where order_id = ${mainId}`)[0].state, 'manual');
    }
    await sql`update email_delivery set state = 'sent' where order_id = ${mainId}`;
  });
  await check('alert HTML escapes hostile message and details', async () => {
    const email = load('src/lib/email.ts', mocks);
    process.env.ADMIN_EMAIL = 'admin@example.com';
    await email.alertAdmin('<img src=x onerror=alert(1)>', '<script>alert(1)</script>', { payload: '</pre><script>bad</script>' });
    assert.ok(!lastEmail.html.includes('<script>'));
    assert.ok(!lastEmail.html.includes('<img src=x'));
    assert.ok(lastEmail.html.includes('&lt;script&gt;'));
  });
  const downloadRequest = () => new Request(`https://example.com/api/download?t=${token.mintDownloadToken(mainId, 'book-a')}`);
  await check('snapshot survives catalogue replacement', async () => {
    books.set('book-a', { ...books.get('book-a'), file_url: 'https://evil.example/changed.pdf' });
    const response = await download.GET(downloadRequest());
    assert.equal(response.status, 200);
    assert.equal(fetchFileUrl, 'https://files.example.com/book.pdf');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const licensed = await PDFDocument.load(await response.arrayBuffer());
    assert.equal(licensed.getPageCount(), 1);
  });
  await check('failed licensing does not consume a download or return raw bytes', async () => {
    const before = (await sql`select count from downloads where order_id = ${mainId} and book_slug = 'book-a'`)[0].count;
    const saved = (await getOrder(mainId)).items;
    const invalidPdfHash = crypto.createHash('sha256').update(new Uint8Array([1, 2])).digest('hex');
    await sql`update orders set items = ${JSON.stringify(saved.map(i => i.slug === 'book-a' ? { ...i, file_sha256: invalidPdfHash } : i))}::jsonb where id = ${mainId}`;
    badPdf = true;
    try {
      assert.equal((await download.GET(downloadRequest())).status, 503);
      assert.equal((await sql`select count from downloads where order_id = ${mainId} and book_slug = 'book-a'`)[0].count, before);
    } finally {
      badPdf = false;
      await sql`update orders set items = ${JSON.stringify(saved)}::jsonb where id = ${mainId}`;
    }
  });
  await check('changed source bytes fail against purchased checksum without consuming a download', async () => {
    const before = (await sql`select count from downloads where order_id = ${mainId} and book_slug = 'book-a'`)[0].count;
    const catalogueBook = books.get('book-a');
    servedPdfBytes = changedPdfBytes;
    books.set('book-a', { ...catalogueBook, file_sha256: crypto.createHash('sha256').update(changedPdfBytes).digest('hex') });
    try {
      const response = await download.GET(downloadRequest());
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /integrity/i);
      assert.equal((await getOrder(mainId)).items[0].file_sha256, pdfHash);
      assert.equal((await sql`select count from downloads where order_id = ${mainId} and book_slug = 'book-a'`)[0].count, before);
    } finally { servedPdfBytes = pdfBytes; books.set('book-a', catalogueBook); }
  });
  await check('legacy or malformed purchased checksums fail closed without consuming a download', async () => {
    const saved = (await getOrder(mainId)).items;
    const before = (await sql`select count from downloads where order_id = ${mainId} and book_slug = 'book-a'`)[0].count;
    try {
      for (const checksum of [null, '', 'invalid', 'a'.repeat(63), 'g'.repeat(64), 'a'.repeat(64) + '\n']) {
        await sql`update orders set items = ${JSON.stringify(saved.map(i => i.slug === 'book-a' ? { ...i, file_sha256: checksum } : i))}::jsonb where id = ${mainId}`;
        const response = await download.GET(downloadRequest());
        assert.equal(response.status, 503);
        assert.match((await response.json()).error, /support/i);
        assert.equal((await sql`select count from downloads where order_id = ${mainId} and book_slug = 'book-a'`)[0].count, before);
      }
    } finally { await sql`update orders set items = ${JSON.stringify(saved)}::jsonb where id = ${mainId}`; }
  });
  await check('EPUB checks raw integrity and returns non-PDF bytes unchanged', async () => {
    const saved = (await getOrder(mainId)).items;
    const epubBytes = new Uint8Array([0x50, 0x4b, 3, 4, 0, 1, 2, 3]);
    const epubHash = crypto.createHash('sha256').update(epubBytes).digest('hex');
    const before = (await sql`select count from downloads where order_id = ${mainId} and book_slug = 'book-b'`)[0].count;
    const req = () => new Request(`https://example.com/api/download?t=${token.mintDownloadToken(mainId, 'book-b')}`);
    servedPdfBytes = epubBytes;
    try {
      for (const checksum of [null, pdfHash]) {
        await sql`update orders set items = ${JSON.stringify(saved.map(i => i.slug === 'book-b' ? { ...i, file_sha256: checksum } : i))}::jsonb where id = ${mainId}`;
        assert.equal((await download.GET(req())).status, 503);
        assert.equal((await sql`select count from downloads where order_id = ${mainId} and book_slug = 'book-b'`)[0].count, before);
      }
      await sql`update orders set items = ${JSON.stringify(saved.map(i => i.slug === 'book-b' ? { ...i, file_sha256: epubHash.toUpperCase() } : i))}::jsonb where id = ${mainId}`;
      const response = await download.GET(req());
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/epub+zip');
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), epubBytes);
      assert.equal((await sql`select count from downloads where order_id = ${mainId} and book_slug = 'book-b'`)[0].count, before + 1);
    } finally {
      servedPdfBytes = pdfBytes;
      await sql`update orders set items = ${JSON.stringify(saved)}::jsonb where id = ${mainId}`;
    }
  });
  await check('asset integrity migration preserves legacy books and enforces nullable 64-hex hashes', async () => {
    await sql`insert into books(slug,title,price_inr) values('legacy-hash-test','Legacy',100)`;
    const migration = readFileSync(new URL('../migrations/005-asset-integrity.sql', import.meta.url), 'utf8');
    await database.exec(migration);
    await database.exec(migration);
    assert.equal((await sql`select file_sha256 from books where slug='legacy-hash-test'`)[0].file_sha256, null);
    for (const checksum of [pdfHash, pdfHash.toUpperCase(), null]) {
      await sql`update books set file_sha256=${checksum} where slug='legacy-hash-test'`;
      assert.equal((await sql`select file_sha256 from books where slug='legacy-hash-test'`)[0].file_sha256, checksum);
    }
    for (const checksum of ['', 'a'.repeat(63), 'g'.repeat(64), 'a'.repeat(65), 'a'.repeat(64) + '\n']) {
      await assert.rejects(() => sql`update books set file_sha256=${checksum} where slug='legacy-hash-test'`);
    }
  });
  await check('published private blob uses authenticated storage reads', async () => {
    const saved = (await getOrder(mainId)).items;
    await sql`update orders set items = ${JSON.stringify(saved.map(i => i.slug === 'book-a' ? { ...i, file_url: 'https://store.private.blob.vercel-storage.com/book.pdf' } : i))}::jsonb where id = ${mainId}`;
    process.env.BLOB_READ_WRITE_TOKEN = 'offline-blob-token';
    const before = blobReads;
    assert.equal((await download.GET(downloadRequest())).status, 200);
    assert.equal(blobReads, before + 1);
    await sql`update orders set items = ${JSON.stringify(saved)}::jsonb where id = ${mainId}`;
  });
  await check('concurrent downloads cannot exceed cap', async () => {
    await sql`update downloads set count = 9 where order_id = ${mainId} and book_slug = 'book-a'`;
    const responses = await Promise.all([download.GET(downloadRequest()), download.GET(downloadRequest()), download.GET(downloadRequest())]);
    assert.equal(responses.filter(r => r.status === 200).length, 1);
    assert.equal(responses.filter(r => r.status === 429).length, 2);
    assert.equal((await sql`select count from downloads where order_id = ${mainId} and book_slug = 'book-a'`)[0].count, 10);
  });
  await check('missing download entitlement cannot bypass cap', async () => {
    await sql`delete from downloads where order_id = ${mainId} and book_slug = 'book-a'`;
    assert.equal((await download.GET(downloadRequest())).status, 429);
  });
  await check('verified partial refund revokes order and entitlements', async () => {
    payments.get('pay_1').amount_refunded = 1;
    await fulfil.fulfilOrder(link.id, 'pay_1');
    assert.equal((await getOrder(mainId)).status, 'refunded');
    assert.ok((await sql`select * from downloads where order_id = ${mainId}`)[0].revoked_at);
    assert.equal((await download.GET(downloadRequest())).status, 403);
    assert.equal(await fulfil.fulfilOrder(link.id, 'pay_1'), false);
  });
  await check('webhook rejects forged and malformed signatures without provider side effects', async () => {
    const before = emailSends;
    const raw = JSON.stringify({ event: 'payment_link.paid', payload: { payment_link: { entity: link } } });
    for (const signature of ['0'.repeat(64), '\u00e9'.repeat(64), '']) {
      const response = await webhook.POST(new Request('https://example.com/api/webhook', { method: 'POST', headers: { 'x-razorpay-signature': signature }, body: raw }));
      assert.equal(response.status, 400);
    }
    assert.equal(emailSends, before);
  });
  await check('signed refund event still relies on provider refund state', async () => {
    const raw = JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_1' } } } });
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
    assert.equal((await webhook.POST(new Request('https://example.com/api/webhook', { method: 'POST', headers: { 'x-razorpay-signature': signature }, body: raw }))).status, 200);
    assert.equal((await getOrder(mainId)).status, 'refunded');
  });
  await check('cron accepts only its bearer secret, never a query token or admin secret', async () => {
    process.env.ADMIN_TOKEN = 'offline-admin';
    for (const req of [new Request('https://example.com/api/cron/reconcile?token=offline-cron'), new Request('https://example.com/api/cron/reconcile', { headers: { authorization: 'Bearer offline-admin' } })])
      assert.equal((await cron.GET(req)).status, 401);
    assert.equal((await cron.GET(new Request('https://example.com/api/cron/reconcile', { headers: { authorization: 'Bearer offline-cron' } }))).status, 200);
  });
  await check('cron finds missed refunds on fulfilled orders', async () => {
    const rows = await sql`select * from orders where checkout_key = 'checkout-race-0001'`;
    const target = rows[0];
    const targetLink = links.get(target.razorpay_link_id);
    targetLink.status = 'paid'; targetLink.amount_paid = target.total; targetLink.payments = [{ payment_id: 'pay_2', status: 'captured' }];
    payments.set('pay_2', { id: 'pay_2', order_id: 'order_provider2', amount: target.total, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 });
    await fulfil.fulfilOrder(targetLink.id, 'pay_2');
    await sql`update orders set created_at = now() - interval '1 year' where id = ${target.id}`;
    payments.get('pay_2').amount_refunded = target.total;
    payments.get('pay_2').status = 'refunded';
    const response = await cron.GET(new Request('https://example.com/api/cron/reconcile', { headers: { authorization: 'Bearer offline-cron' } }));
    assert.equal(response.status, 200);
    assert.equal((await getOrder(target.id)).status, 'refunded');
  });
  await check('missing production release configuration blocks checkout', async () => {
    delete process.env.RESEND_API_KEY;
    assert.equal((await checkout.POST(request('checkout-release001'))).status, 503);
    process.env.RESEND_API_KEY = 'offline';
  });
  await check('checkout runs without a webhook secret, and the webhook then rejects every call', () => {
    const saved = process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    try {
      assert.equal(razorpay.checkoutConfiguration().dev, false);
      assert.equal(razorpay.verifyWebhook('{}', 'a'.repeat(64)), false);
    } finally { process.env.RAZORPAY_WEBHOOK_SECRET = saved; }
  });
  await check('production release requires legal, support, auth, and policy approval', () => {
    for (const field of ['LEGAL_ENTITY_NAME', 'LEGAL_ENTITY_ADDRESS', 'SUPPORT_EMAIL', 'AUTH_SECRET', 'COMMERCE_POLICIES_APPROVED']) {
      const saved = process.env[field];
      delete process.env[field];
      try { assert.throws(() => razorpay.checkoutConfiguration(), `${field} must be required`); }
      finally { process.env[field] = saved; }
    }
  });
  await check('production rejects legal placeholders and short security secrets', () => {
    for (const [field, invalid] of [['SUPPORT_EMAIL', 'support@example.com'], ['LEGAL_ENTITY_NAME', 'TODO'], ['LEGAL_ENTITY_NAME', 'Seller details awaiting confirmation'], ['LEGAL_ENTITY_ADDRESS', 'your-address'], ['AUTH_SECRET', 'short'], ['DOWNLOAD_SECRET', 'short']]) {
      const saved = process.env[field];
      process.env[field] = invalid;
      try { assert.throws(() => razorpay.checkoutConfiguration()); }
      finally { process.env[field] = saved; }
    }
  });
  await check('production never accepts explicit development bypass', () => {
    process.env.ALLOW_DEV_CHECKOUT = 'true';
    delete process.env.RAZORPAY_KEY_ID;
    assert.throws(() => razorpay.checkoutConfiguration());
    process.env.RAZORPAY_KEY_ID = 'rzp_test_offline';
    delete process.env.ALLOW_DEV_CHECKOUT;
  });
  await check('development requires explicit bypass and never sends or charges', async () => {
    process.env.NODE_ENV = 'development';
    const key = process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_ID;
    assert.throws(() => razorpay.checkoutConfiguration());
    process.env.ALLOW_DEV_CHECKOUT = 'true';
    books.set('book-a', { ...books.get('book-a'), file_url: 'https://files.example.com/book.pdf' });
    const charges = creations, mails = emailSends;
    const response = await checkout.POST(request('checkout-development01'));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.noPayment, true);
    assert.equal((await getOrder(result.orderId)).is_dev, true);
    assert.equal((await getOrder(result.orderId)).status, 'fulfilled');
    assert.equal(creations, charges);
    assert.equal(emailSends, mails);
    process.env.NODE_ENV = 'production';
    process.env.RAZORPAY_KEY_ID = key;
    delete process.env.ALLOW_DEV_CHECKOUT;
  });
  const twenty = { id: 'off20', name: 'Twenty off', kind: 'percent', scope: 'all', targets: [], value: 20, cap: null, buy_qty: null, get_qty: null, get_percent: null,
    bundle_qty: null, bundle_price: null, min_items: 0, min_subtotal: 0, code: null, combinable: false, first_order_only: false, usage_limit: null,
    per_customer_limit: null, priority: 0, starts_at: null, ends_at: null, status: 'active', uses: 0, created_at: '2026-10-01T00:00:00Z' };
  let offerOrderId;
  await check('checkout charges the server-priced offer and records it on the order', async () => {
    await sql`insert into offers(id,name,kind,scope,value,status) values('off20','Twenty off','percent','all',20,'active') on conflict do nothing`;
    liveOffers = [twenty];
    const response = await checkout.POST(request('checkout-offer-00001', { slugs: ['book-a'], expectedTotal: 15920 }));
    assert.equal(response.status, 200);
    offerOrderId = (await response.json()).orderId;
    const order = await getOrder(offerOrderId);
    assert.equal(order.subtotal, 19900); assert.equal(order.discount, 3980); assert.equal(order.total, 15920);
    assert.equal(order.items[0].price, 15920); assert.equal(order.items[0].discount, 3980); assert.equal(order.items[0].list_price, 19900);
    assert.deepEqual(order.offers, [{ id: 'off20', name: 'Twenty off', code: null, saving: 3980 }]);
    assert.equal(links.get(order.razorpay_link_id).amount, 15920, 'Razorpay is asked for the discounted total');
  });
  await check('a changed total is refused before any payment link exists', async () => {
    await sql`update orders set created_at = created_at - interval '2 hours'`; // clear the hourly attempt cap for this fixture
    const before = creations;
    const response = await checkout.POST(request('checkout-offer-00002', { slugs: ['book-a'], email: 'other@example.com', expectedTotal: 19900 }));
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error, 'Prices changed.'); assert.equal(body.pricing.total, 15920);
    assert.equal(creations, before);
  });
  await check('the coupon is part of the idempotency hash', async () => {
    assert.equal((await checkout.POST(request('checkout-offer-00001', { slugs: ['book-a'], expectedTotal: 15920, coupon: 'SAVE10' }))).status, 409);
  });
  await check('a reused key with a different total never returns the old payment link', async () => {
    const before = creations;
    assert.equal((await checkout.POST(request('checkout-offer-00001', { slugs: ['book-a'], expectedTotal: 15000 }))).status, 409);
    assert.equal(creations, before);
  });
  await check('fulfilment records one redemption per offer, once', async () => {
    const order = await getOrder(offerOrderId);
    const link = links.get(order.razorpay_link_id);
    link.status = 'paid'; link.amount_paid = order.total; link.payments = [{ payment_id: 'pay_offer', status: 'captured' }];
    payments.set('pay_offer', { id: 'pay_offer', order_id: 'order_provider1', amount: order.total, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 });
    assert.equal(await fulfil.fulfilOrder(link.id, 'pay_offer'), true);
    await fulfil.fulfilOrder(link.id, 'pay_offer');
    assert.deepEqual(await sql`select offer_id,order_id,email,discount from offer_redemptions`, [{ offer_id: 'off20', order_id: offerOrderId, email: 'reader@example.com', discount: 3980 }]);
    liveOffers = [];
  });
} finally { globalThis.fetch = originalFetch; await database.close(); }
finish();
