// Offline: admin "Put on sale" and price edits for first-party books, against real migrations in PGlite.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createIsolatedDatabase } from './isolated-db.mjs';

const { putOnSale, setRegularPrice, SaleError, fileCheck, validateAdminUpload, recordBookFile, recordBookCover, MAX_UPLOAD_BYTES } = await import('../src/lib/admin-sale.ts');
const root = await mkdtemp(path.join(tmpdir(), 'admin-sale-'));
await mkdir(path.join(root, 'private', 'books'), { recursive: true });
const real = Buffer.alloc(5000, 3);
await writeFile(path.join(root, 'private', 'books', 'real.pdf'), real);
await writeFile(path.join(root, 'private', 'books', 'sample.pdf'), Buffer.alloc(696, 1));

assert.deepEqual(await fileCheck(root, 'private:real.pdf'), { ok: true, reason: null });
assert.match((await fileCheck(root, 'private:sample.pdf')).reason, /placeholder/);
assert.match((await fileCheck(root, 'private:gone.pdf')).reason, /missing/);
assert.match((await fileCheck(root, null)).reason, /No file/);
assert.match((await fileCheck(root, 'https://files.example.com/x.pdf')).reason, /Upload the book PDF/);

const { db } = await createIsolatedDatabase();
const sql = async (parts, ...values) => (await db.query(parts.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), values)).rows;
const book = async (slug) => (await sql`select price_inr, release_approved, scan_status, file_sha256 from books where slug=${slug}`)[0];
try {
  await db.query(`insert into books(slug,title,price_inr,file_url,file_format) values
    ('real-book','Real',100,'private:real.pdf','PDF'), ('placeholder-book','Placeholder',100,'private:sample.pdf','PDF'),
    ('no-file','No file',100,null,'PDF'), ('free-book','Free',0,'private:real.pdf','PDF'),
    ('remote-book','Remote',100,'https://files.example.com/x.pdf','PDF')`);
  await db.query(`insert into books(slug,title,price_inr,file_url,file_format,third_party) values ('author-book','Author',100,'private:real.pdf','PDF',true)`);

  const released = await putOnSale(sql, { slug: 'real-book', root });
  assert.equal(released.sha, createHash('sha256').update(real).digest('hex'));
  assert.deepEqual(await book('real-book'), { price_inr: 100, release_approved: true, scan_status: 'clean', file_sha256: released.sha });
  const audit = await sql`select payload from events where type='admin.book.put_on_sale'`;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].payload.slug, 'real-book');

  await assert.rejects(putOnSale(sql, { slug: 'placeholder-book', root }), (e) => e instanceof SaleError && /real PDF/.test(e.message));
  assert.equal((await book('placeholder-book')).release_approved, false, 'a placeholder never goes on sale');
  await assert.rejects(putOnSale(sql, { slug: 'no-file', root }), /attach the book file/i);
  await assert.rejects(putOnSale(sql, { slug: 'free-book', root }), /price/i);
  await assert.rejects(putOnSale(sql, { slug: 'remote-book', root }), /Upload the book PDF/i);
  await assert.rejects(putOnSale(sql, { slug: 'author-book', root }), /author submission/i, 'author books keep their review process');
  await assert.rejects(putOnSale(sql, { slug: 'missing', root }), (e) => e.status === 404);

  await setRegularPrice(sql, { slug: 'real-book', rupees: '1' });
  assert.equal((await book('real-book')).price_inr, 100);
  await setRegularPrice(sql, { slug: 'real-book', rupees: '249.50' });
  assert.equal((await book('real-book')).price_inr, 24950);
  assert.equal((await book('real-book')).release_approved, true, 'a price change keeps the book on sale');
  for (const bad of ['0', '-1', 'abc', '1.234', '']) await assert.rejects(setRegularPrice(sql, { slug: 'real-book', rupees: bad }), SaleError, bad);
  await db.query(`update books set sale_price_inr=20000 where slug='real-book'`);
  await assert.rejects(setRegularPrice(sql, { slug: 'real-book', rupees: '150' }), /sale price/i, 'regular price stays above an active sale price');
  assert.equal((await sql`select count(*)::int n from events where type='admin.book.price'`)[0].n, 2);

  // Admin uploads: 5 MB limit, real PDF/image bytes, recorded file and cover.
  assert.equal(MAX_UPLOAD_BYTES, 5 * 1024 * 1024);
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(3000, 32)]);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(100, 0)]);
  assert.equal(validateAdminUpload(pdf, 'pdf'), 'application/pdf');
  assert.equal(validateAdminUpload(png, 'cover'), 'image/png');
  assert.throws(() => validateAdminUpload(Buffer.concat([pdf, Buffer.alloc(MAX_UPLOAD_BYTES)]), 'pdf'), /5 MB/);
  assert.throws(() => validateAdminUpload(png, 'pdf'), /PDF/);
  assert.throws(() => validateAdminUpload(pdf, 'cover'), /image/);
  assert.throws(() => validateAdminUpload(Buffer.alloc(0), 'pdf'), SaleError);
  const blobUrl = 'https://abc123.private.blob.vercel-storage.com/admin/books/placeholder-book/u1-pdf';
  const uploaded = await recordBookFile(sql, { slug: 'placeholder-book', url: blobUrl, bytes: pdf, pathname: 'admin/books/placeholder-book/u1-pdf' });
  const afterUpload = (await sql`select file_url, file_sha256, release_approved, file_format from books where slug='placeholder-book'`)[0];
  assert.deepEqual(afterUpload, { file_url: blobUrl, file_sha256: uploaded.sha, release_approved: false, file_format: 'PDF' });
  assert.deepEqual(await fileCheck(root, blobUrl, uploaded.sha), { ok: true, reason: null });
  assert.match((await fileCheck(root, blobUrl, null)).reason, /upload/i);
  await putOnSale(sql, { slug: 'placeholder-book', root });
  assert.equal((await book('placeholder-book')).release_approved, true, 'an uploaded file can go on sale');
  await recordBookFile(sql, { slug: 'placeholder-book', url: blobUrl, bytes: pdf, pathname: 'admin/books/placeholder-book/u2-pdf' });
  assert.equal((await book('placeholder-book')).release_approved, false, 'a new file takes the book off sale until released again');
  await assert.rejects(recordBookFile(sql, { slug: 'author-book', url: blobUrl, bytes: pdf, pathname: 'x' }), /author/i);
  const cover = await recordBookCover(sql, { slug: 'real-book', bytes: png, pathname: 'admin/books/real-book/c1-cover' });
  const afterCover = (await sql`select cover, facts->>'_cover_blob' as blob from books where slug='real-book'`)[0];
  assert.equal(afterCover.cover, cover.path);
  assert.match(cover.path, /^\/api\/book-cover\/real-book\/[a-f0-9]{12}$/);
  assert.equal(afterCover.blob, 'admin/books/real-book/c1-cover');
  assert.equal((await sql`select count(*)::int n from events where type in ('admin.book.file_uploaded','admin.book.cover_uploaded')`)[0].n, 3);
} finally { await db.close(); }
console.log('Admin sale: put on sale with checksum and audit, placeholder/missing/free/remote/author refusals, price edits keep release.');
