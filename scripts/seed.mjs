import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { applySchema } from './migrate.mjs';

assert.ok(process.argv.includes('--apply-draft-catalogue'), 'Explicit --apply-draft-catalogue is required to write draft records. Use preview:isolated for demos.');
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required.');
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await applySchema(client);
  const books = JSON.parse(await readFile(new URL('./books.json', import.meta.url), 'utf8'));
  for (const book of books) {
    await client.query(`insert into books(slug,title,subtitle,description,long_description,highlights,cover,price_inr,publisher,sort,facts,authorship)
      values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11::jsonb,$12) on conflict(slug) do nothing`,
    [book.slug, book.title, book.subtitle, book.description, book.long_description, JSON.stringify(book.highlights), book.cover,
      book.price_inr ?? 0, book.publisher, book.sort, JSON.stringify(book.facts), book.authorship]);
  }
  console.log('Missing records inserted as unsaleable drafts. Prices are stored, but nothing is for sale until a file is attached and the product is released.');
} finally { await client.end(); }
