// Releases first-party books whose files live in private/books: records each file's SHA-256,
// marks the scan clean and the title released, and writes an audit event.
//   node --env-file=<env> scripts/release-books.mjs <expected-db-host-prefix>           status only
//   node --env-file=<env> scripts/release-books.mjs <expected-db-host-prefix> --apply   release
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MIN_BYTES = 1024;

export function hostMatches(databaseUrl, expected) {
  if (typeof expected !== 'string' || expected.length < 6) return false;
  try { return new URL(databaseUrl).hostname.startsWith(expected); } catch { return false; }
}

export async function bookStatus(sql) {
  return await sql`select slug, price_inr, active, release_approved, scan_status, file_url,
    left(coalesce(file_sha256, ''), 12) as sha from books order by sort, slug`;
}

export async function releaseBooks(sql, { root, reason }) {
  const results = [];
  for (const book of await sql`select slug, file_url from books where file_url like 'private:%' order by slug`) {
    const file = book.file_url.slice(8);
    if (!/^[^\\/:]+$/.test(file) || file === '.' || file === '..') { results.push({ slug: book.slug, released: false, error: 'invalid file name' }); continue; }
    let bytes;
    try { bytes = await readFile(path.join(root, 'private', 'books', file)); }
    catch { results.push({ slug: book.slug, released: false, error: `missing private/books/${file}` }); continue; }
    if (bytes.length < MIN_BYTES) { results.push({ slug: book.slug, released: false, error: `${file} is ${bytes.length} bytes; supply the real PDF` }); continue; }
    const sha = createHash('sha256').update(bytes).digest('hex');
    const rows = await sql`with changed as (
      update books set file_sha256=${sha}, scan_status='clean', release_approved=true where slug=${book.slug} returning slug
    ), audit as (insert into events(order_id,type,payload)
      select null,'admin.book.released_file',jsonb_build_object('slug',slug,'file',${file}::text,'file_sha256',${sha}::text,'reason',${reason}::text) from changed)
    select slug from changed`;
    results.push({ slug: book.slug, released: rows.length === 1, sha });
  }
  return results;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [expected] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const url = process.env.DATABASE_URL;
  if (!url || !hostMatches(url, expected)) {
    console.error('Refusing: pass the database host prefix you expect (at least 6 characters) as the first argument; DATABASE_URL does not match it.');
    process.exit(1);
  }
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  if (process.argv.includes('--apply')) {
    for (const r of await releaseBooks(sql, { root: process.cwd(), reason: 'Release of supplied first-party files' }))
      console.log(r.released ? `released ${r.slug} (sha ${r.sha.slice(0, 12)}...)` : `NOT released ${r.slug}: ${r.error ?? 'update matched no row'}`);
  }
  console.table(await bookStatus(sql));
}
