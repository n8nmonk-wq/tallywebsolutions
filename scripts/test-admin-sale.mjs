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
assert.match((await fileCheck(root, 'https://files.example.com/x.pdf')).reason, /Upload the product file/);

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

  await assert.rejects(putOnSale(sql, { slug: 'placeholder-book', root }), (e) => e instanceof SaleError && /real file/.test(e.message));
  assert.equal((await book('placeholder-book')).release_approved, false, 'a placeholder never goes on sale');
  await assert.rejects(putOnSale(sql, { slug: 'no-file', root }), /Upload the product file before/i);
  await assert.rejects(putOnSale(sql, { slug: 'free-book', root }), /price/i);
  await assert.rejects(putOnSale(sql, { slug: 'remote-book', root }), /Upload the product file/i);
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
  // TCP files are compiled (binary) Tally programs; TDL source may be saved as UTF-16 with a byte-order mark.
  assert.equal(validateAdminUpload(Buffer.from([0x54, 0x43, 0x50, 0, 1, 0, 0, 2]), 'pdf', 'tcp'), 'application/octet-stream');
  assert.equal(validateAdminUpload(Buffer.from('﻿[Part: Test]', 'utf16le'), 'pdf', 'tdl'), 'text/plain');
  assert.equal(validateAdminUpload(Buffer.from('[Part: Test]'), 'pdf', 'tdl'), 'text/plain');
  assert.throws(() => validateAdminUpload(Buffer.from([0x50, 0, 0x41, 0]), 'pdf', 'tdl'), /plain-text/);
  const blobUrl = 'https://abc123.private.blob.vercel-storage.com/admin/books/placeholder-book/u1-pdf';
  // A product that already has a file only takes a new one when the admin chose Replace.
  await assert.rejects(recordBookFile(sql, { slug: 'placeholder-book', url: blobUrl, bytes: pdf, pathname: 'admin/books/placeholder-book/u0-pdf' }), /already has a file/);
  const uploaded = await recordBookFile(sql, { slug: 'placeholder-book', url: blobUrl, bytes: pdf, pathname: 'admin/books/placeholder-book/u1-pdf', name: 'C:/fakepath/Guide<1>.pdf', replace: true });
  const afterUpload = (await sql`select file_url, file_sha256, release_approved, file_format, file_size, facts->>'_file_name' as name, facts->>'_file_type' as type from books where slug='placeholder-book'`)[0];
  assert.deepEqual(afterUpload, { file_url: blobUrl, file_sha256: uploaded.sha, release_approved: false, file_format: 'PDF', file_size: '3 KB', name: 'Guide1.pdf', type: 'PDF' });
  assert.deepEqual(await fileCheck(root, blobUrl, uploaded.sha), { ok: true, reason: null });
  assert.match((await fileCheck(root, blobUrl, null)).reason, /upload/i);
  await putOnSale(sql, { slug: 'placeholder-book', root });
  assert.equal((await book('placeholder-book')).release_approved, true, 'an uploaded file can go on sale');
  await assert.rejects(recordBookFile(sql, { slug: 'placeholder-book', url: blobUrl, bytes: pdf, pathname: 'admin/books/placeholder-book/u2-pdf' }), /Replace file/);
  assert.equal((await book('placeholder-book')).release_approved, true, 'a refused upload leaves the product on sale');
  // The product is sold as one type; a file of another type cannot be put on sale.
  await sql`update books set file_format='EPUB' where slug='placeholder-book'`;
  await sql`update books set release_approved=false where slug='placeholder-book'`;
  await assert.rejects(putOnSale(sql, { slug: 'placeholder-book', root }), /attached file is PDF, but the product is sold as EPUB/);
  await sql`update books set file_format='PDF' where slug='placeholder-book'`;
  await putOnSale(sql, { slug: 'placeholder-book', root });
  await recordBookFile(sql, { slug: 'placeholder-book', url: blobUrl, bytes: pdf, pathname: 'admin/books/placeholder-book/u2-pdf', replace: true });
  assert.equal((await book('placeholder-book')).release_approved, false, 'a new file takes the book off sale until released again');
  await assert.rejects(recordBookFile(sql, { slug: 'author-book', url: blobUrl, bytes: pdf, pathname: 'x' }), /submission/i);
  const cover = await recordBookCover(sql, { slug: 'real-book', bytes: png, pathname: 'admin/books/real-book/c1-cover' });
  const afterCover = (await sql`select cover, facts->>'_cover_blob' as blob from books where slug='real-book'`)[0];
  assert.equal(afterCover.cover, cover.path);
  assert.match(cover.path, /^\/api\/product-cover\/real-book\/[a-f0-9]{12}$/);
  assert.equal(afterCover.blob, 'admin/books/real-book/c1-cover');
  await assert.rejects(recordBookCover(sql, { slug: 'real-book', bytes: png, pathname: 'admin/books/real-book/c2-cover' }), /Replace cover/);
  await recordBookCover(sql, { slug: 'real-book', bytes: png, pathname: 'admin/books/real-book/c2-cover', replace: true });
  assert.equal((await sql`select count(*)::int n from events where type in ('admin.book.file_uploaded','admin.book.cover_uploaded')`)[0].n, 4);
} finally { await db.close(); }
console.log('Admin sale: put on sale with checksum and audit, placeholder/missing/free/remote/author/wrong-type refusals, explicit replace for files and covers, price edits keep release.');
