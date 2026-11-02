import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createIsolatedDatabase } from './isolated-db.mjs';

const source = readFileSync(new URL('../src/lib/analytics.ts', import.meta.url), 'utf8')
  .replace(/import \{ sql \} from "\.\/db";/, 'const sql = (...a) => globalThis.analyticsSql(...a);');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseRange, previousRange, getAnalytics } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

// Ranges are India-time calendar days, inclusive.
const today = '2026-10-16';
assert.deepEqual(parseRange({}, today), { preset: '30d', from: '2026-09-17', to: '2026-10-16', days: 30 });
assert.deepEqual(parseRange({ range: '7d' }, today), { preset: '7d', from: '2026-10-10', to: '2026-10-16', days: 7 });
assert.equal(parseRange({ range: '12m' }, today).days, 365);
assert.deepEqual(parseRange({ from: '2026-10-01', to: '2026-10-05' }, today), { preset: 'custom', from: '2026-10-01', to: '2026-10-05', days: 5 });
assert.equal(parseRange({ from: '2026-10-05', to: '2026-10-01' }, today).preset, '30d', 'a backwards range falls back to the default');
assert.equal(parseRange({ from: 'bad', to: '2026-10-01' }, today).preset, '30d');
assert.equal(parseRange({ from: '2020-01-01', to: '2026-10-01' }, today).preset, '30d', 'more than 366 days is refused');
assert.deepEqual(previousRange({ from: '2026-10-10', to: '2026-10-16', days: 7 }), { from: '2026-10-03', to: '2026-10-09', days: 7 });

const { db } = await createIsolatedDatabase();
globalThis.analyticsSql = async (parts, ...values) => (await db.query(parts.reduce((t, p, i) => t + (i ? `$${i}` : '') + p, ''), values)).rows;
try {
  const item = (slug, price, discount = 0) => ({ slug, title: slug.toUpperCase(), price, discount, list_price: price + discount });
  const order = (id, status, ist, items, extra = {}) => db.query(
    `insert into orders(id,email,items,subtotal,total,status,created_at,paid_at,refunded_at,is_dev) values($1,$2,$3::jsonb,$4,$4,$5,$6::timestamptz,$7::timestamptz,$8::timestamptz,$9)`,
    [id, extra.email ?? 'buyer@real.in', JSON.stringify(items), items.reduce((s, i) => s + i.price, 0), status, `${ist}+05:30`,
      ['paid', 'fulfilled', 'refunded'].includes(status) ? `${ist}+05:30` : null, extra.refunded ? `${extra.refunded}+05:30` : null, extra.dev ?? false]);
  await order('a', 'fulfilled', '2026-10-15T23:30:00', [item('x', 20000, 5000)]);          // 15 Oct India time (18:00 UTC)
  await order('b', 'paid', '2026-10-16T00:30:00', [item('x', 20000), item('y', 10000)]);     // 16 Oct India time, but 15 Oct UTC
  await order('c', 'created', '2026-10-16T10:00:00', [item('y', 10000)]);                    // started, never paid
  await order('d', 'payment_failed', '2026-10-14T10:00:00', [item('y', 10000)]);
  await order('e', 'refunded', '2026-10-12T10:00:00', [item('z', 30000)], { refunded: '2026-10-13T09:00:00' });
  await order('dev', 'fulfilled', '2026-10-15T10:00:00', [item('x', 99900)], { dev: true });
  await order('demo', 'fulfilled', '2026-10-15T10:00:00', [item('x', 99900)], { email: 'demo@example.com' });
  await order('old', 'fulfilled', '2026-10-05T10:00:00', [item('x', 10000)]);                // previous period only

  const week = parseRange({ range: '7d' }, today);
  const a = await getAnalytics(week);
  assert.deepEqual(a.kpis, { revenue: 50000, orders: 2, aov: 25000, started: 5, conversion: 40, discount: 5000, refunds: 30000, refundCount: 1 },
    'paid revenue only; dev and demo orders excluded; refunded orders are not revenue');
  assert.deepEqual(a.previous, { revenue: 10000, orders: 1, aov: 10000, started: 1, conversion: 100, discount: 0, refunds: 0, refundCount: 0 });
  assert.equal(a.daily.length, 7, 'every day of the range, including empty ones');
  assert.deepEqual(a.daily.slice(-2), [{ day: '2026-10-15', revenue: 20000, orders: 1 }, { day: '2026-10-16', revenue: 30000, orders: 1 }], 'days are India time');
  assert.deepEqual(a.topBooks, [{ slug: 'x', title: 'X', units: 2, revenue: 40000 }, { slug: 'y', title: 'Y', units: 1, revenue: 10000 }]);
  assert.deepEqual(a.offers, [], 'no redemptions yet');

  await db.exec(`insert into offers(id,name,kind,scope,value,status) values('o1','Twenty','percent','all',20,'active');
    insert into offer_redemptions(offer_id,order_id,email,discount) values('o1','a','buyer@real.in',5000);`);
  assert.deepEqual((await getAnalytics(week)).offers, [{ id: 'o1', name: 'Twenty', uses: 1, given: 5000, revenue: 20000 }]);
  await db.exec('drop table offer_redemptions; drop table offers;');
  assert.deepEqual((await getAnalytics(week)).offers, [], 'before offers are turned on, analytics still loads');
} finally { await db.close(); }
console.log('Analytics checks passed: India-time ranges, presets, KPIs, previous period, daily series, top books, offers, exclusions.');
