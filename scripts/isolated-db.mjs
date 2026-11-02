import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { seedDemo } from '../src/lib/demo-catalogue.mjs';

export async function createIsolatedDatabase({ seed = false } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'reading-room-'));
  const db = new PGlite(directory);
  await db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  const migrations = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name, migrations), 'utf8'));
  }
  if (seed) {
    const books = JSON.parse(await readFile(new URL('./books.json', import.meta.url), 'utf8'));
    for (const book of books) {
      await db.query(`insert into books(slug,title,subtitle,description,long_description,authorship,cover,price_inr,file_url,highlights,facts,publisher,sort)
        values($1,$2,$3,$4,$5,$6,$7,0,$8,$9::jsonb,$10::jsonb,$11,$12)`,
      [book.slug, book.title, book.subtitle, book.description, book.long_description, book.authorship, book.cover, book.file_url,
        JSON.stringify(book.highlights), JSON.stringify(book.facts), book.publisher, book.sort]);
    }
    await seedDemo(db);
  }
  return { db, directory };
}
