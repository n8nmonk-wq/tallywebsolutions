// Offline: the live check reports misconfiguration and never creates an order.
import assert from 'node:assert/strict';
import { runLiveChecks } from './check-live.mjs';

const BASE = 'https://shop.example.com';
function site({ checkout = 400, token = true, buy = true } = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname + url.search, method: init.method ?? 'GET', body: init.body, headers: init.headers ?? {} });
    const html = (body) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
    if (url.pathname === '/api/checkout') return Response.json({ error: 'x' }, { status: checkout });
    if (url.pathname === '/api/search/suggest') return Response.json({ books: [{ slug: 'real-book' }], authors: [], categories: [] });
    if (url.pathname === '/admin/login') return html(token ? '<label>Admin password</label>' : '<a>Sign in with email</a>');
    if (url.pathname === '/') return html('<a href="/books/real-book">Real</a>');
    if (url.pathname === '/books/real-book') return html(buy ? '<p>₹1</p><button>Buy now</button>' : '<button>Unavailable</button>');
    return html('<main>ok</main>');
  };
  return { fetchImpl, calls };
}

const healthy = site();
const ok = await runLiveChecks(BASE, healthy.fetchImpl);
assert.deepEqual(ok.failures, []);
const checkoutCall = healthy.calls.find(c => c.path === '/api/checkout');
assert.equal(checkoutCall.method, 'POST');
assert.equal(checkoutCall.body, '{}', 'no slugs, no customer details');
assert.ok(!Object.keys(checkoutCall.headers).some(h => h.toLowerCase() === 'idempotency-key'), 'never sends an idempotency key, so no order can be created');

const broken = await runLiveChecks(BASE, site({ checkout: 503, token: false, buy: false }).fetchImpl);
assert.ok(broken.failures.some(f => /Checkout is switched off/.test(f)));
assert.ok(broken.failures.some(f => /ADMIN_PASSWORD/.test(f)));
assert.ok(broken.failures.some(f => /no price or Buy now/.test(f)));
console.log('Live check: healthy site passes; checkout off, missing admin token and unsellable books are reported; no order is ever created.');
