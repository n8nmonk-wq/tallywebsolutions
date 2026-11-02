import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { load } from './test-commerce.mjs';

const db = new PGlite();
await db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
for (const n of readdirSync(new URL('../migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort())
  await db.exec(readFileSync(new URL(`../migrations/${n}`, import.meta.url), 'utf8'));
const sql = async (parts, ...v) => (await db.query(parts.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), v)).rows;
await db.exec(`insert into books(slug,title,price_inr,active) values('a','A',100,true),('b','B',100,true),('gone','Gone',100,false)`);
const provider = load('src/lib/wishlist-parse.ts');
const w = load('src/lib/wishlist.ts', { './db': { sql } });

assert.deepEqual(provider.parseWishlist('["a","a","../x",3,"b"]'), ['a', 'b']);
assert.equal(provider.parseWishlist(JSON.stringify(Array.from({ length: 150 }, (_, i) => `s-${i}`))).length, 100);
assert.deepEqual(provider.parseWishlist('nope'), []);

assert.equal(await w.addWishlist('r1', 'a'), true);
assert.equal(await w.addWishlist('r1', 'a'), true, 'idempotent');
assert.equal(await w.addWishlist('r1', 'gone'), false, 'archived books cannot be added');
assert.equal(await w.addWishlist('r1', 'missing'), false, 'unknown books cannot be added');
assert.deepEqual(await w.mergeWishlist('r1', ['b', 'gone', 'missing', 'a']), ['b', 'a']);
await db.exec(`update books set active=false where slug='b'`);
assert.deepEqual(await w.listWishlist('r1'), ['a'], 'archived titles disappear from the list without errors');
await w.removeWishlist('r1', 'a');
assert.deepEqual(await w.listWishlist('r1'), []);
assert.deepEqual(await w.listWishlist('r2'), [], 'readers are isolated');

const reader = { current: { id: 'r3', email: 'r3@example.com', name: 'R' } };
const route = load('src/app/api/wishlist/route.ts', { '@/lib/wishlist': w, '@/lib/reader-auth': { getReader: async () => reader.current, checkOrigin: req => req.headers.get('origin') === 'https://example.com' } });
const req = (method, body, origin = 'https://example.com') => new Request('https://example.com/api/wishlist', { method, headers: { origin, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
assert.equal((await route.POST(req('POST', { slug: 'a' }, 'https://evil.example'))).status, 403);
assert.deepEqual(await (await route.POST(req('POST', { slug: 'a' }))).json(), { slugs: ['a'] });
assert.equal((await route.POST(req('POST', { slug: '../etc' }))).status, 400);
reader.current = null;
assert.equal((await route.GET(req('GET'))).status, 401);
await db.close();
console.log('Wishlist checks passed: parsing, visibility, idempotency, merge drops archived and unknown, isolation, origin and auth.');
