import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { load } from './test-commerce.mjs';

const db = new PGlite();
await db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
for (const n of readdirSync(new URL('../migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort())
  await db.exec(readFileSync(new URL(`../migrations/${n}`, import.meta.url), 'utf8'));
const sql = async (parts, ...v) => (await db.query(parts.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), v)).rows;
const getBooks = async () => sql`select * from books where active order by sort, title`;
const store = load('src/lib/store-data.ts', { '@/lib/db': { sql, getBooks }, './db': { sql, getBooks } });
const limit = load('src/lib/rate-limit.ts', { './db': { sql } });

await db.exec(`insert into categories(slug,name,sort) values('science','Science',2),('fiction','Fiction',1),('hidden','Hidden',0)`);
await db.exec(`update categories set status='draft' where slug='hidden'`);
assert.deepEqual((await store.getCategories()).map(c => c.slug), ['fiction', 'science']);

await db.exec(`insert into books(slug,title,price_inr,file_url,release_approved,scan_status,sale_price_inr)
  values('a','A',10000,'private:a.pdf',true,'clean',8000),('b','B',10000,'private:b.pdf',true,'clean',null)`);
const books = await store.getStoreBooks(new Date('2026-10-15T00:00:00Z'));
assert.equal(books.find(b => b.slug === 'a').price, 8000);
assert.equal('file_url' in books[0], false);

const order = (id, status, slugs, ago = '1 day') => db.query(
  `insert into orders(id,email,items,subtotal,total,status,created_at) values($1,'x@example.com',$2::jsonb,1,1,$3,now()-$4::interval)`,
  [id, JSON.stringify(slugs.map(slug => ({ slug, title: slug, price: 1 }))), status, ago]);
await order('o1', 'fulfilled', ['b']); await order('o2', 'paid', ['b', 'a']); await order('o3', 'created', ['a']);
await order('o4', 'payment_failed', ['a']); await order('o5', 'fulfilled', ['a'], '200 days');
assert.deepEqual(await store.bestsellerSlugs(90, 10), ['b', 'a']);

assert.equal(await limit.consumeLimit('k', 2, 60), true);
assert.equal(await limit.consumeLimit('k', 2, 60), true);
assert.equal(await limit.consumeLimit('k', 2, 60), false);
assert.notEqual(limit.clientKey(new Request('http://x', { headers: { 'x-vercel-forwarded-for': '1.1.1.1' } }), 's'),
  limit.clientKey(new Request('http://x'), 's'));
await db.close();
console.log('Store data checks passed: published categories, priced public books, real-order bestsellers, rate limits.');
