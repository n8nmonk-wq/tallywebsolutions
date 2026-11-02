import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/offers.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { priceCart, isLive, offerBadge, offerBadges, normaliseCode } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const now = new Date('2026-10-16T12:00:00Z');
const line = (slug, price) => ({ slug, price, regular: price, categories: ['ayurveda'], collections: [] });
const cart = [line('a', 30000), line('b', 20000), line('c', 10000)];
let n = 0;
const offer = (o = {}) => ({ id: `o${++n}`, name: `Offer ${n}`, kind: 'percent', scope: 'all', targets: [], value: 20, cap: null, buy_qty: null, get_qty: null,
  get_percent: null, bundle_qty: null, bundle_price: null, min_items: 0, min_subtotal: 0, code: null, combinable: false, first_order_only: false,
  usage_limit: null, per_customer_limit: null, priority: 0, starts_at: null, ends_at: null, status: 'active', uses: 0, created_at: '2026-10-01T00:00:00Z', ...o });
const price = (offers, ctx = {}) => priceCart(cart, offers, { now, ...ctx });
const prices = (r) => r.lines.map((l) => l.price);

// percent and cap
let r = price([offer()]);
assert.equal(r.discount, 12000); assert.equal(r.total, 48000); assert.deepEqual(prices(r), [24000, 16000, 8000]);
r = price([offer({ value: 50, cap: 10000 })]);
assert.equal(r.discount, 10000); assert.deepEqual(r.lines.map((l) => l.discount), [5001, 3333, 1666], "cap split by price share, remainder on the dearest");

// flat per book and per order with minimum
assert.equal(price([offer({ kind: 'flat', value: 5000, scope: 'books', targets: ['a'] })]).total, 55000);
assert.equal(price([offer({ kind: 'flat', value: 5000, scope: 'order', min_subtotal: 70000 })]).discount, 0);
assert.equal(price([offer({ kind: 'flat', value: 5000, scope: 'order', min_subtotal: 50000 })]).discount, 5000);

// buy x get y, bundle
const b2g1 = offer({ kind: 'bxgy', buy_qty: 2, get_qty: 1, get_percent: 100 });
r = price([b2g1]);
assert.equal(r.discount, 10000); assert.equal(r.lines[2].price, 0, 'the cheapest book is free');
assert.equal(priceCart(cart.slice(0, 2), [b2g1], { now }).discount, 0, 'two books do not complete buy 2 get 1');
r = price([offer({ kind: 'bundle', bundle_qty: 2, bundle_price: 40000 })]);
assert.equal(r.discount, 10000); assert.equal(r.lines[2].price, 10000, 'the third book keeps its price');

// several automatic offers: each book used once, largest saving first
r = price([offer({ scope: 'books', targets: ['a'] }), offer({ kind: 'flat', value: 15000, scope: 'books', targets: ['a', 'b'] })]);
assert.equal(r.applied.length, 1); assert.equal(r.discount, 30000);

// coupons
const save10 = offer({ code: 'SAVE10', value: 10, combinable: true });
r = price([offer(), save10], { code: 'SAVE10' });
assert.equal(r.discount, 16800, 'combinable coupon applies after the automatic offer');
assert.equal(r.coupon.ok, true);
r = price([offer(), offer({ code: 'FLAT50', kind: 'flat', value: 5000, scope: 'order' })], { code: 'FLAT50' });
assert.equal(r.discount, 12000); assert.equal(r.coupon.ok, false); assert.equal(r.coupon.message, 'A better offer is already applied.');
assert.equal(price([save10], { code: '  save10 ' }).discount, 6000, 'codes are trimmed and upper-cased');
r = price([save10], { code: 'NOPE' });
assert.equal(r.coupon.ok, false); assert.equal(r.coupon.message, 'This code is not valid.'); assert.equal(r.discount, 0);
assert.equal(normaliseCode('  save 10! '), 'SAVE10');

// total never below Rs 1
assert.equal(priceCart([line('a', 150)], [offer({ kind: 'flat', value: 99999, scope: 'order' })], { now }).total, 100);

// only live offers apply
for (const dead of [offer({ status: 'paused' }), offer({ ends_at: '2026-10-16T11:00:00Z' }), offer({ starts_at: '2026-10-17T00:00:00Z' }), offer({ usage_limit: 5, uses: 5 })]) {
  assert.equal(isLive(dead, now), false);
  assert.equal(price([dead]).discount, 0);
}
assert.equal(isLive(offer(), now), true);

// customer conditions
const first = offer({ first_order_only: true });
assert.equal(price([first], { customer: { paidOrders: 1, uses: {} } }).discount, 0);
assert.equal(price([first], { customer: null }).discount, 12000, 'unknown email at the cart: shown, checked at checkout');
const once = offer({ per_customer_limit: 1 });
assert.equal(price([once], { customer: { paidOrders: 3, uses: { [once.id]: 1 } } }).discount, 0);

// badges
assert.equal(offerBadge(offer()), '20% off');
assert.equal(offerBadge(offer({ kind: 'flat', value: 5000 })), '₹50 off');
assert.equal(offerBadge(b2g1), 'Buy 2 get 1');
assert.equal(offerBadge(offer({ kind: 'bxgy', buy_qty: 2, get_qty: 1, get_percent: 50 })), 'Buy 2 get 1 at 50% off');
assert.equal(offerBadge(offer({ kind: 'bundle', bundle_qty: 2, bundle_price: 40000 })), 'Any 2 for ₹400');
assert.equal(offerBadge(save10), 'Code SAVE10');

// Badges a book shows: live offers that can apply to it; whole-order offers are not shown per book.
assert.deepEqual(offerBadges(cart[0], [offer({ scope: 'category', targets: ['ayurveda'] }), offer({ kind: 'flat', value: 5000, scope: 'order' }),
  offer({ scope: 'books', targets: ['zzz'] }), offer({ status: 'paused' }), save10], now), ['20% off', 'Code SAVE10']);
assert.deepEqual(offerBadges(cart[0], [save10, offer()], now), ['20% off', 'Code SAVE10'], 'automatic offers come before codes, so a card flag is never a code');

// Data loading on a real (in-memory) database.
{
  const { createIsolatedDatabase } = await import('./isolated-db.mjs');
  const loadData = async (db) => {
    globalThis.offerTestSql = async (parts, ...values) => (await db.query(parts.reduce((t, p, i) => t + (i ? `$${i}` : '') + p, ''), values)).rows;
    const src = readFileSync(new URL('../src/lib/offer-data.ts', import.meta.url), 'utf8')
      .replace(/import \{ sql, type Book \} from "\.\/db";/, 'const sql = globalThis.offerTestSql;')
      .replace('"./money"', JSON.stringify('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(readFileSync(new URL('../src/lib/money.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')));
    const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    return import('data:text/javascript;base64,' + Buffer.from(out + `
// ${Math.random()}`).toString('base64'));
  };
  const { db } = await createIsolatedDatabase();
  try {
    const data = await loadData(db);
    await db.exec(`insert into categories(slug,name) values('health','Health') on conflict do nothing;
      insert into categories(slug,name,parent_slug) values('ayur','Ayurveda','health') on conflict do nothing;
      insert into books(slug,title,price_inr,sale_price_inr,category_slug) values('x','X',30000,24000,'ayur');
      insert into content_collections(slug,title,book_slugs,status) values('picks','Picks','["x"]','published');
      insert into offers(id,name,kind,scope,value,status) values('live','Live','percent','all',10,'active'),('old','Old','percent','all',10,'active'),('draft','Draft','percent','all',10,'draft');
      update offers set ends_at = now() - interval '1 day', starts_at = now() - interval '2 days' where id='old';
      insert into orders(id,email,subtotal,total,status) values('p1','Buyer@Example.com',100,100,'fulfilled'),('p2','buyer@example.com',100,100,'created');
      insert into offer_redemptions(offer_id,order_id,email,discount) values('live','p1','buyer@example.com',10);`);
    const offers = await data.loadOffers();
    assert.deepEqual(offers.map((o) => o.id), ['live'], 'only active, unexpired offers load');
    assert.equal(offers[0].uses, 1); assert.ok(isLive(offers[0], new Date()), 'timestamps come back parseable');
    const [x] = await data.cartLines([(await db.query(`select * from books where slug='x'`)).rows[0]]);
    assert.deepEqual([x.price, x.regular, x.categories, x.collections], [24000, 30000, ['ayur', 'health'], ['picks']]);
    assert.deepEqual(await data.customerHistory('BUYER@example.com'), { paidOrders: 1, uses: { live: 1 } }, 'email match ignores case; unpaid orders do not count');
    await db.exec('drop table offer_redemptions; drop table offers; drop table content_collections;');
    const fresh = await loadData(db);
    assert.deepEqual(await fresh.loadOffers(), [], 'before setup the store sells at normal prices');
    assert.deepEqual((await fresh.customerHistory('buyer@example.com')).uses, {});
    assert.deepEqual((await fresh.cartLines([(await db.query(`select * from books where slug='x'`)).rows[0]]))[0].collections, []);
  } finally { await db.close(); }
}

console.log('Offers engine checks passed: percent, cap, flat, minimums, buy x get y, bundles, stacking, coupons, ₹1 floor, live rules, customer limits, badges.');
