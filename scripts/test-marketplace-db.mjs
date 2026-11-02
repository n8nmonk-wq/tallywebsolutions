import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const apply = async () => {
  await db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  for (const name of readdirSync(new URL('../migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort())
    await db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
};
try {
  await apply();
  await db.query(`insert into books(slug,title,price_inr,subject) values('legacy','Legacy',10000,'Research methodology')`);
  await apply(); // idempotent re-run copies subjects again without duplicates
  const category = (await db.query(`select slug,name from categories where slug='research-methodology'`)).rows[0];
  assert.deepEqual(category, { slug: 'research-methodology', name: 'Research methodology' });
  assert.equal((await db.query(`select category_slug from books where slug='legacy'`)).rows[0].category_slug, 'research-methodology');

  await db.query(`update books set sale_price_inr=5000 where slug='legacy'`);
  for (const bad of [0, 10000, 15000]) await assert.rejects(db.query(`update books set sale_price_inr=${bad} where slug='legacy'`));
  await assert.rejects(db.query(`update books set sale_starts_at='2026-10-20', sale_ends_at='2026-10-19' where slug='legacy'`));

  await db.query(`insert into wishlist(reader_id,book_slug) values('r1','legacy')`);
  await assert.rejects(db.query(`insert into wishlist(reader_id,book_slug) values('r1','legacy')`));
  await assert.rejects(db.query(`insert into wishlist(reader_id,book_slug) values('r1','missing')`));

  for (const type of ['announcement', 'promo', 'genre-switcher', 'banner'])
    await db.query(`insert into content_modules(id,type,title,ends_at) values($1,$1,'x',now())`, [type]);
  await assert.rejects(db.query(`insert into content_modules(id,type,title) values('bad','popup','x')`));
} finally { await db.close(); }
console.log('Marketplace migration checks passed: idempotent re-run, subject backfill, sale constraints, wishlist keys, module types.');
