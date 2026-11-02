import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createIsolatedDatabase } from './isolated-db.mjs';
import { load } from './test-commerce.mjs';

const compile = (path, replace = (s) => s) => {
  const out = ts.transpileModule(replace(readFileSync(new URL(path, import.meta.url), 'utf8')), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return 'data:text/javascript;base64,' + Buffer.from(out).toString('base64');
};
const offersUrl = compile('../src/lib/offers.ts');
const admin = await import(compile('../src/lib/offer-admin.ts', (s) => s
  .replace(/import \{ sql, logEvent \} from "\.\/db";/, 'const sql = (...a) => globalThis.offerAdminSql(...a), logEvent = async (...a) => globalThis.offerAdminEvents.push(a);')
  .replace('"./offers"', JSON.stringify(offersUrl))));

const form = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, String(x))); return f; };
const base = { name: 'Festive 20', kind: 'percent', scope: 'all', value: '20', status: 'active' };

// Validation
assert.throws(() => admin.parseOffer(form({ ...base, value: '95' })), /between 1 and 90/);
assert.throws(() => admin.parseOffer(form({ ...base, kind: 'bxgy', value: '0' })), /Buy and get/);
assert.throws(() => admin.parseOffer(form({ ...base, kind: 'bundle', value: '0' })), /bundle/i);
assert.throws(() => admin.parseOffer(form({ ...base, starts_at: '2026-10-20T10:00', ends_at: '2026-10-19T10:00' })), /ends after it starts/);
assert.throws(() => admin.parseOffer(form({ ...base, code: 'x' })), /3 to 32/);
assert.throws(() => admin.parseOffer(form({ ...base, scope: 'books' })), /Choose at least one/);
const parsed = admin.parseOffer(form({ ...base, kind: 'flat', value: '50', min_subtotal: '199', code: ' fest-50 ', starts_at: '2026-10-20T10:00', scope: 'books', book_slugs: ['a', 'b'] }));
assert.equal(parsed.value, 5000, 'flat rupees become paise'); assert.equal(parsed.min_subtotal, 19900);
assert.equal(parsed.code, 'FEST-50'); assert.deepEqual(parsed.targets, ['a', 'b']);
assert.equal(parsed.starts_at, '2026-10-20T10:00:00+05:30', 'admin enters India time');
assert.equal(admin.parseOffer(form({ ...base, kind: 'bxgy', buy_qty: '2', get_qty: '1' })).get_percent, 100, 'free by default');

const { db } = await createIsolatedDatabase();
globalThis.offerAdminSql = async (parts, ...values) => (await db.query(parts.reduce((t, p, i) => t + (i ? `$${i}` : '') + p, ''), values)).rows;
globalThis.offerAdminEvents = [];
try {
  // Setup on a database that never had offers.
  await db.exec('drop table offer_redemptions; drop table offers; alter table orders drop column discount; alter table orders drop column offers;');
  assert.equal(await admin.offersReady(), false);
  await admin.setupOffers(readFileSync(new URL('../migrations/008-offers.sql', import.meta.url), 'utf8'));
  assert.equal(await admin.offersReady(), true);
  await db.exec('alter table orders drop column offers;');
  assert.equal(await admin.offersReady(), false, 'a half-applied setup shows the button again');
  await admin.setupOffers(readFileSync(new URL('../migrations/008-offers.sql', import.meta.url), 'utf8'));
  assert.equal(await admin.offersReady(), true, 're-running setup repairs it');

  const id = await admin.saveOffer(parsed);
  await admin.setOfferStatus(id, 'paused');
  const [row] = (await db.query('select status, code from offers where id=$1', [id])).rows;
  assert.deepEqual(row, { status: 'paused', code: 'FEST-50' });
  assert.ok(globalThis.offerAdminEvents.some(([, type]) => type === 'admin.offer.saved'));
  const copy = await admin.duplicateOffer(id);
  const [dup] = (await db.query('select name, code, status from offers where id=$1', [copy])).rows;
  assert.deepEqual(dup, { name: 'Copy of Festive 20', code: null, status: 'draft' });
  await admin.saveOffer({ ...parsed, id, name: 'Renamed' });
  assert.equal((await db.query('select name from offers where id=$1', [id])).rows[0].name, 'Renamed', 'saving with an id updates');
  assert.equal((await admin.listOffers()).length, 2);
  await db.exec(`insert into orders(id,email,subtotal,total,status) values('ord1','a@b.co',19900,14900,'fulfilled');`);
  await db.query(`insert into offer_redemptions(offer_id,order_id,email,discount) values($1,'ord1','a@b.co',5000)`, [id]);
  assert.deepEqual((await admin.offerStats())[id], { uses: 1, given: 5000, revenue: 14900 });
} finally { await db.close(); }

// Route guards
const route = load('src/app/api/admin/offers/route.ts', {
  '@/lib/admin-auth': { isAdmin: async () => false },
  '@/lib/reader-auth': { checkOrigin: (req) => req.headers.get('origin') === 'https://example.com' },
  '@/lib/offer-admin': {},
  '@/lib/submissions': { readLimitedForm: (req) => req.formData() },
  'next/cache': { revalidatePath: () => {} },
});
const post = (origin) => route.POST(new Request('https://example.com/api/admin/offers', { method: 'POST', headers: { origin }, body: form({ action: 'pause', id: 'x' }) }));
assert.equal((await post('https://evil.example')).status, 403);
assert.equal((await post('https://example.com')).status, 401);
console.log('Offer admin checks passed: validation, India time, setup, save, pause, duplicate, update, stats, route guards.');
