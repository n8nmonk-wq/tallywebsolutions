// Offline: releases only real private files on the confirmed database; refuses placeholders and wrong hosts.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createIsolatedDatabase } from './isolated-db.mjs';
import { bookStatus, hostMatches, releaseBooks } from './release-books.mjs';

assert.equal(hostMatches('postgresql://u:p@ep-fragrant-forest-az04w78m-pooler.example.tech/db', 'ep-fragrant-forest'), true);
assert.equal(hostMatches('postgresql://u:p@ep-live-main.example.tech/db', 'ep-fragrant-forest'), false);
assert.equal(hostMatches('postgresql://u:p@ep-fragrant-forest.example.tech/db', 'ep'), false, 'a short prefix is not a confirmation');
assert.equal(hostMatches('not a url', 'ep-fragrant-forest'), false);

const root = await mkdtemp(path.join(tmpdir(), 'release-books-'));
await mkdir(path.join(root, 'private', 'books'), { recursive: true });
const real = Buffer.alloc(4096, 7);
await writeFile(path.join(root, 'private', 'books', 'real.pdf'), real);
await writeFile(path.join(root, 'private', 'books', 'tiny.pdf'), Buffer.alloc(696, 1));

const { db } = await createIsolatedDatabase();
const sql = async (parts, ...values) => (await db.query(parts.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), values)).rows;
try {
  await db.query(`insert into books(slug,title,price_inr,file_url,file_format) values
    ('real-book','Real',100,'private:real.pdf','PDF'), ('tiny-book','Tiny',100,'private:tiny.pdf','PDF'),
    ('missing-book','Missing',100,'private:gone.pdf','PDF'), ('remote-book','Remote',100,'https://files.example.com/x.pdf','PDF')`);
  const results = await releaseBooks(sql, { root, reason: 'Offline test release' });
  const bySlug = Object.fromEntries(results.map(r => [r.slug, r]));
  assert.equal(bySlug['real-book'].released, true);
  assert.equal(bySlug['real-book'].sha, createHash('sha256').update(real).digest('hex'));
  assert.equal(bySlug['tiny-book'].released, false);
  assert.match(bySlug['tiny-book'].error, /supply the real PDF/);
  assert.equal(bySlug['missing-book'].released, false);
  assert.ok(!('remote-book' in bySlug), 'only private: files are handled');
  const status = Object.fromEntries((await bookStatus(sql)).map(r => [r.slug, r]));
  assert.equal(status['real-book'].release_approved, true);
  assert.equal(status['real-book'].scan_status, 'clean');
  assert.equal(status['tiny-book'].release_approved, false);
  const audit = (await db.query(`select payload from events where type='admin.book.released_file'`)).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].payload.slug, 'real-book');
  assert.equal(audit[0].payload.reason, 'Offline test release');
} finally { await db.close(); }
console.log('Book release: host guard, placeholder refusal, missing files, checksum, release state and audit passed.');
