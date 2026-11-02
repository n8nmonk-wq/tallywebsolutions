import assert from 'node:assert/strict';
import { createIsolatedDatabase } from './isolated-db.mjs';
import { demoCatalogue } from '../src/lib/demo-catalogue.mjs';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const data = demoCatalogue(new Date('2026-10-15T00:00:00Z'));
assert.ok(data.categories.length >= 12);
assert.ok(data.books.length >= 60);
assert.equal(new Set(data.books.map(b => b.slug)).size, data.books.length);
for (const book of data.books) {
  assert.match(book.cover, /^data:image\/svg\+xml;utf8,/);
  assert.equal(book.facts._demo, 'true');
  assert.ok(book.sale_price_inr == null || book.sale_price_inr < book.price_inr);
}
assert.ok(data.books.some(b => b.sale_price_inr), 'some titles are on offer');
assert.ok(data.books.some(b => b.release_date > '2026-10-15'), 'some titles are coming soon');
assert.ok(new Set(data.books.map(b => b.language)).size >= 4, 'several languages for the language shelf');

const { db } = await createIsolatedDatabase({ seed: true });
try {
  const count = (await db.query(`select count(*)::int n from books where facts->>'_demo'='true'`)).rows[0].n;
  assert.ok(count >= 60);
  const banners = (await db.query(`select count(*)::int n from content_modules where type='banner' and status='published'`)).rows[0].n;
  assert.ok(banners >= 2);
} finally { await db.close(); }
// Admin switch on a live-shaped database: two real titles, no subjects. Load, load again, then remove.
{
  const { db } = await createIsolatedDatabase();
  try {
    const q = async (text, values = []) => (await db.query(text, values)).rows;
    await q(`insert into books(slug,title,price_inr,release_approved,scan_status) values('real-one','Real one',100,true,'clean'),('real-two','Real two',9900,true,'clean')`);
    await q(`insert into categories(slug,name) values('own-subject','Own subject')`);
    globalThis.demoTestSql = async (parts, ...values) => (await db.query(parts.reduce((t, p, i) => t + (i ? `$${i}` : '') + p, ''), values)).rows;
    globalThis.demoTestLog = async () => {};
    const source = readFileSync(new URL('../src/lib/demo-store.ts', import.meta.url), 'utf8')
      .replace(/import \{ sql, logEvent \} from "\.\/db";/, 'const sql = globalThis.demoTestSql, logEvent = globalThis.demoTestLog;')
      .replace('"./demo-catalogue.mjs"', JSON.stringify(new URL('../src/lib/demo-catalogue.mjs', import.meta.url).href));
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const store = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
    await store.loadDemo(new Date('2026-10-15T00:00:00Z'));
    await store.loadDemo(new Date('2026-10-15T00:00:00Z'));
    assert.equal(await store.demoCount(), data.books.length, 'loading twice adds nothing');
    assert.equal((await q(`select count(*)::int n from content_modules where id like 'demo-%'`))[0].n, 9);
    assert.equal((await q(`select count(*)::int n from orders`))[0].n, 0, 'no fake orders: admin revenue stays real');
    assert.deepEqual((await q(`select distinct category_slug from books where slug like 'real-%'`)).map(r => r.category_slug), ['ayurveda']);
    await store.removeDemo();
    assert.equal(await store.demoCount(), 0);
    assert.equal((await q(`select count(*)::int n from books`))[0].n, 2, 'real titles survive removal');
    assert.equal((await q(`select count(*)::int n from content_modules where id like 'demo-%'`))[0].n, 0);
    assert.deepEqual((await q(`select slug from categories order by slug`)).map(r => r.slug), ['ayurveda', 'own-subject'], 'only empty demo subjects go');
  } finally { await db.close(); }
}
console.log('Demo catalogue checks passed: 60+ unique demo titles, offers, coming soon, languages, banners, real titles kept.');
