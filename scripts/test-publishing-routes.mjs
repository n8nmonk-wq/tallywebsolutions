import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, createHash } from 'node:crypto';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { NextResponse } from 'next/server.js';
import sharp from 'sharp';
import { renderToStaticMarkup } from 'react-dom/server';

const db = new PGlite();
const oldBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
const oldScanSecret = process.env.SCAN_WEBHOOK_SECRET;
let reader = null;
let admin = false;
let uploadedBytes = Buffer.from('%PDF-1.7\nTest PDF quarantine fixture');
let uploadedPath = '';
const origin = 'https://publishing.test';
const dependencies = {
  'next/server': { NextResponse }, 'next/cache': { revalidatePath() {} },
  'next/navigation': { redirect() { throw new Error('Admin sign-in required'); } },
  'react/jsx-runtime': await import('react/jsx-runtime'),
  'lucide-react': await import('lucide-react'),
  '@/components/AdminShell': { default: ({ children }) => children },
  '@/lib/reader-auth': { getReader: async () => reader, checkOrigin: req => req.headers.get('origin') === origin },
  '@/lib/admin-auth': { isAdmin: async () => admin },
  '@vercel/blob/client': { generateClientTokenFromReadWriteToken: async () => 'test-upload-token' },
  '@vercel/blob': {
    head: async path => ({ pathname: path, url: `https://private.blob.vercel-storage.com/${path}`, size: uploadedBytes.length }),
    get: async path => {
      uploadedPath = path;
      return { statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(uploadedBytes); controller.close(); } }) };
    },
  },
  sharp: { default: sharp },
};
globalThis.publishingRouteDependencies = dependencies;
async function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  js = js.replace(/import \{([^}]+)\} from ["']([^"']+)["'];?/g, (statement, names, name) => name.startsWith('node:') ? statement : `const {${names.replace(/\bas\b/g, ':')}} = globalThis.publishingRouteDependencies[${JSON.stringify(name === './db' ? '@/lib/db' : name)}];`)
    .replace(/import AdminShell from "@\/components\/AdminShell";/, 'const AdminShell = globalThis.publishingRouteDependencies["@/components/AdminShell"].default;')
    .replace(/import sharp from "sharp";/, 'const sharp = globalThis.publishingRouteDependencies.sharp.default;')
    .replace(/import (\w+) from "(\.[^"]+)";/g, (statement, name, from) => `const ${name} = globalThis.publishingRouteDependencies[${JSON.stringify(from)}].default;`);
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}
const json = (path, body, extraHeaders = {}, requestOrigin = origin) => new Request(`${origin}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(requestOrigin ? { Origin: requestOrigin } : {}), ...extraHeaders }, body: JSON.stringify(body) });
const form = (path, body, requestOrigin = origin) => new Request(`${origin}${path}`, { method: 'POST', headers: { Origin: requestOrigin }, body: new URLSearchParams(body) });
try {
  await db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../migrations/003-publishing.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../migrations/004-catalogue.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../migrations/007-marketplace.sql', import.meta.url), 'utf8'));
  dependencies['@/lib/db'] = { sql: async (parts, ...values) => (await db.query(parts.reduce((sql, part, i) => sql + (i ? `$${i}` : '') + part, ''), values)).rows };
  dependencies['@/lib/submissions'] = await load('../src/lib/submissions.ts');
  dependencies['@/lib/content'] = await load('../src/lib/content.ts');
  dependencies['@/lib/admin-catalogue'] = await load('../src/lib/admin-catalogue.ts');
  dependencies['@/lib/admin-sale'] = await load('../src/lib/admin-sale.ts');
  dependencies['@/lib/money'] = await load('../src/lib/money.ts');
  dependencies['./BookForm'] = await load('../src/app/admin/books/BookForm.tsx');
  dependencies['./BookUpload'] = { default: () => null };
  const authorRoute = await load('../src/app/api/submissions/route.ts');
  const uploads = await load('../src/app/api/submissions/uploads/route.ts');
  const scanner = await load('../src/app/api/submissions/scan/route.ts');
  const review = await load('../src/app/api/admin/platform/review/route.ts');
  const content = await load('../src/app/api/admin/platform/content/route.ts');
  const assets = await load('../src/app/api/submissions/assets/[id]/route.ts');
  const adminBooks = await load('../src/app/api/admin/book/route.ts');
  const adminBooksPage = await load('../src/app/admin/books/page.tsx');
  const oversizedBookForm = () => new Request(`${origin}/api/admin/book`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': '200001' }, body: 'not-a-form' });
  assert.equal((await adminBooks.POST(oversizedBookForm())).status, 401);
  assert.equal((await adminBooks.POST(new Request(`${origin}/api/admin/book`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'multipart/form-data' }, body: 'invalid multipart' }))).status, 401);
  await assert.rejects(adminBooksPage.default({ searchParams: Promise.resolve({}) }), /Admin sign-in required/);
  assert.equal((await authorRoute.POST(form('/api/submissions', { action: 'profile', name: 'Test author' }))).status, 401);
  reader = { id: 'reader-a', email: 'test@example.test', name: 'Test author' };
  assert.equal((await authorRoute.POST(form('/api/submissions', { action: 'profile', name: 'Test author' }, 'https://evil.test'))).status, 403);
  assert.equal((await authorRoute.POST(form('/api/submissions', { action: 'profile', name: 'Test author' }))).status, 303);
  assert.equal((await authorRoute.POST(form('/api/submissions', { action: 'create', title: 'Test title', description: 'Test fixture', price_inr: '500', file_url: 'https://evil.test/paid.pdf' }))).status, 400);
  assert.equal((await authorRoute.POST(form('/api/submissions', { action: 'create', title: 'Test title', description: 'Test fixture', price_inr: '500' }))).status, 303);
  const submission = (await dependencies['@/lib/submissions'].getAuthorSubmissions(reader.id))[0];
  const id = submission.id;
  process.env.BLOB_READ_WRITE_TOKEN = 'fake-test-token';
  reader = { ...reader, id: 'other-reader' };
  assert.equal((await uploads.POST(json('/api/submissions/uploads', { action: 'ticket', submission_id: id, kind: 'manuscript' }))).status, 409);
  reader = { ...reader, id: 'reader-a' };
  assert.equal((await uploads.POST(json('/api/submissions/uploads', { action: 'finalize', ticket_id: 'guessed', url: 'https://evil.test/paid.pdf' }))).status, 409);
  const registered = [];
  for (const kind of ['manuscript', 'cover', 'sample']) {
    const ticketResponse = await uploads.POST(json('/api/submissions/uploads', { action: 'ticket', submission_id: id, kind }));
    assert.equal(ticketResponse.status, 200);
    const ticket = await ticketResponse.json();
    assert.ok(ticket.pathname.startsWith('quarantine/reader-a/'));
    uploadedBytes = kind === 'cover' ? await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).png().toBuffer() : Buffer.from('%PDF-1.7\nTest quarantine fixture');
    const response = await uploads.POST(json('/api/submissions/uploads', { action: 'finalize', ticket_id: ticket.ticket_id, url: 'https://evil.test/ignored.pdf' }));
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    assert.equal(result.scan_status, 'pending');
    assert.equal(uploadedPath, ticket.pathname);
    registered.push({ id: result.asset_id, hash: createHash('sha256').update(uploadedBytes).digest('hex'), kind });
    assert.equal((await uploads.POST(json('/api/submissions/uploads', { action: 'finalize', ticket_id: ticket.ticket_id }))).status, 409);
  }
  const badTicket = await (await uploads.POST(json('/api/submissions/uploads', { action: 'ticket', submission_id: id, kind: 'sample' }))).json();
  uploadedBytes = Buffer.from('not a PDF');
  assert.equal((await uploads.POST(json('/api/submissions/uploads', { action: 'finalize', ticket_id: badTicket.ticket_id }))).status, 400);
  const badImage = await (await uploads.POST(json('/api/submissions/uploads', { action: 'ticket', submission_id: id, kind: 'cover' }))).json();
  uploadedBytes = Buffer.from([137,80,78,71,13,10,26,10]);
  // A magic-byte match alone cannot validate a malformed cover.
  assert.equal((await uploads.POST(json('/api/submissions/uploads', { action: 'finalize', ticket_id: badImage.ticket_id }))).status, 400);
  const current = () => dependencies['@/lib/submissions'].getAuthorSubmissions(reader.id).then(rows => rows[0]);
  assert.equal((await authorRoute.POST(form('/api/submissions', { action: 'submit', id, version: String((await current()).version) }))).status, 400);
  assert.equal((await authorRoute.POST(form('/api/submissions', { action: 'submit', id, version: String((await current()).version), ownership_declared: 'on' }))).status, 303);
  assert.equal((await review.POST(form('/api/admin/platform/review', { action: 'review', id, version: String((await current()).version) }))).status, 401);
  admin = true;
  assert.equal((await adminBooks.POST(oversizedBookForm())).status, 413);
  await db.query("insert into books(slug,title,price_inr,facts) values('existing-firstparty','Existing first-party book',100,'{\"_internal\":\"preserved\",\"Old\":\"discard\"}')");
  const bookMetadata = { action: 'save', slug: 'existing-firstparty', title: 'Edited first-party book', price_inr: '1.25', cover: '/assets/cover.png', active: 'on', facts: 'Author: Reviewed author', pages: '100', year: '2026' };
  assert.equal((await adminBooks.POST(form('/api/admin/book', bookMetadata, 'https://evil.test'))).status, 403);
  for (const invalid of [{ title: '' }, { title: 'a'.repeat(201) }, { price_inr: '' }, { price_inr: '1.001' }, { price_inr: '1000000.01' }, { pages: '-1' }, { pages: '1.5' }, { year: '10000' }, { cover: 'javascript:alert(1)' }, { cover: '//evil.test/cover.png' }, { cover: '/\\evil.test' }, { facts: '_internal: overwritten' }, { file_url: 'https://evil.test/arbitrary.pdf' }, { file_sha256: 'b'.repeat(64) }]) {
    assert.equal((await adminBooks.POST(form('/api/admin/book', { ...bookMetadata, ...invalid }))).status, 400, JSON.stringify(invalid));
  }
  assert.equal((await adminBooks.POST(form('/api/admin/book', bookMetadata))).status, 303);
  const edited = (await db.query("select title,price_inr,facts,release_approved from books where slug='existing-firstparty'")).rows[0];
  assert.deepEqual(edited, { title: 'Edited first-party book', price_inr: 125, facts: { _internal: 'preserved', Author: 'Reviewed author' }, release_approved: false });
  assert.equal((await review.POST(form('/api/admin/platform/review', { action: 'review', id, version: String((await current()).version) }, 'https://evil.test'))).status, 403);
  assert.equal((await review.POST(form('/api/admin/platform/review', { action: 'review', id, version: String((await current()).version) }))).status, 303);
  assert.equal((await review.POST(form('/api/admin/platform/review', { action: 'mark_clean', id, version: String((await current()).version) }))).status, 409);
  assert.equal((await assets.GET(new Request(origin), { params: Promise.resolve({ id: registered[0].id }) })).status, 409);
  delete process.env.SCAN_WEBHOOK_SECRET;
  assert.equal((await scanner.POST(json('/api/submissions/scan', {}))).status, 503);
  process.env.SCAN_WEBHOOK_SECRET = 'local-test-scanner-secret-only';
  function scan(asset, override = {}) {
    const payload = { asset_id: asset.id, sha256: asset.hash, status: 'clean', scanner_reference: 'test-engine/report-1', ...override };
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', process.env.SCAN_WEBHOOK_SECRET).update(`${timestamp}.${JSON.stringify(payload)}`).digest('hex');
    return json('/api/submissions/scan', payload, { 'x-scan-timestamp': timestamp, 'x-scan-signature': signature });
  }
  assert.equal((await scanner.POST(json('/api/submissions/scan', { status: 'clean' }))).status, 401);
  assert.equal((await scanner.POST(scan(registered[0], { sha256: 'b'.repeat(64) }))).status, 409);
  for (const asset of registered) {
    assert.equal((await scanner.POST(scan(asset))).status, 200);
    assert.equal((await scanner.POST(scan(asset))).status, 200);
    assert.equal((await review.POST(form('/api/admin/platform/review', { action: 'review_asset', id, version: String((await current()).version), asset_id: asset.id, reviewed: 'on' }))).status, 303);
  }
  assert.equal((await review.POST(form('/api/admin/platform/review', { action: 'approve', id, version: String((await current()).version), rights_approved: 'on', commercial_approved: 'on' }))).status, 303);
  assert.equal((await review.POST(form('/api/admin/platform/review', { action: 'release', id, version: String((await current()).version), slug: 'test-released-title' }))).status, 303);
  const released = (await db.query("select file_sha256 from books where slug='test-released-title'")).rows[0];
  assert.equal(released.file_sha256, registered.find(asset => asset.kind === 'manuscript').hash);
  const thirdpartyBefore = (await db.query("select * from books where slug='test-released-title'")).rows[0];
  const thirdpartySubmissionBefore = (await db.query('select * from publishing_submissions where id=$1', [id])).rows[0];
  const thirdpartySnapshot = [{ slug: 'test-released-title', title: 'Purchased publication', price: thirdpartyBefore.price_inr, file_url: thirdpartyBefore.file_url, file_sha256: thirdpartyBefore.file_sha256, file_format: 'PDF' }];
  await db.query("insert into orders(id,email,items,subtotal,total,status) values('thirdparty-purchase','reader@example.test',$1::jsonb,$2,$2,'fulfilled')", [JSON.stringify(thirdpartySnapshot), thirdpartyBefore.price_inr]);
  const metadataAuditCount = (await db.query("select count(*)::int count from events where type='admin.book.updated'")).rows[0].count;
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...bookMetadata, slug: 'test-released-title' }))).status, 409);
  assert.deepEqual((await db.query("select * from books where slug='test-released-title'")).rows[0], thirdpartyBefore);
  assert.equal((await db.query("select count(*)::int count from events where type='admin.book.updated'")).rows[0].count, metadataAuditCount);
  const archiveForm = { action: 'archive', slug: 'test-released-title', reason: 'Withdraw public visibility temporarily', confirmed: 'on' };
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...archiveForm, slug: 'existing-firstparty' }))).status, 409);
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...archiveForm, confirmed: '' }))).status, 400);
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...archiveForm, price_inr: '0' }))).status, 400);
  assert.equal((await adminBooks.POST(form('/api/admin/book', archiveForm))).status, 303);
  assert.deepEqual((await db.query("select * from books where slug='test-released-title'")).rows[0], { ...thirdpartyBefore, active: false });
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...archiveForm, action: 'restore', reason: 'Restore approved public visibility' }))).status, 303);
  assert.deepEqual((await db.query("select * from books where slug='test-released-title'")).rows[0], thirdpartyBefore);
  assert.deepEqual((await db.query('select * from publishing_submissions where id=$1', [id])).rows[0], thirdpartySubmissionBefore);
  assert.deepEqual((await db.query("select items from orders where id='thirdparty-purchase'")).rows[0].items, thirdpartySnapshot);
  const visibilityAudit = (await db.query("select type,payload from events where type in ('admin.book.archived','admin.book.restored') order by id")).rows;
  assert.deepEqual(visibilityAudit.map(event => event.type), ['admin.book.archived', 'admin.book.restored']);
  assert.equal(visibilityAudit[0].payload.reason, archiveForm.reason);
  assert.equal(visibilityAudit[0].payload.slug, 'test-released-title');
  await db.query("insert into books(slug,title,price_inr,third_party) values('unapproved-thirdparty','Unapproved publication',100,true)");
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...archiveForm, slug: 'unapproved-thirdparty', action: 'restore' }))).status, 303);
  assert.equal((await db.query("select release_approved from books where slug='unapproved-thirdparty'")).rows[0].release_approved, false);
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...archiveForm, slug: 'unapproved-thirdparty', action: 'restore', release_approved: 'on' }))).status, 400);
  await db.query("delete from books where slug='unapproved-thirdparty'");
  await db.query(`insert into publishing_submissions(id,author_id,title,description,price_inr,status,ownership_declared,ownership_declared_by,ownership_declared_at,rights_approved,commercial_approved)
    select 'existing-review',author_id,title,description,price_inr,'approved',ownership_declared,ownership_declared_by,ownership_declared_at,true,true from publishing_submissions where id=$1`, [id]);
  await db.query(`insert into publishing_assets(id,submission_id,kind,blob_url,sha256,content_type,size_bytes,scan_status,reviewed)
    select 'existing-' || kind,'existing-review',kind,blob_url,sha256,content_type,size_bytes,'clean',true from publishing_assets where submission_id=$1`, [id]);
  const releaseForm = { action: 'release', slug: 'existing-firstparty', submission_id: 'existing-review', reason: 'Reviewed first-party publication', confirmed: 'on' };
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...releaseForm, confirmed: '' }))).status, 400);
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...releaseForm, reason: '' }))).status, 400);
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...releaseForm, file_url: 'https://evil.test/arbitrary.pdf' }))).status, 400);
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...releaseForm, slug: 'test-released-title' }))).status, 409);
  await db.query("update publishing_assets set reviewed=false where id='existing-manuscript'");
  assert.equal((await adminBooks.POST(form('/api/admin/book', releaseForm))).status, 409);
  await db.query("update publishing_assets set reviewed=true where id='existing-manuscript'");
  assert.equal((await adminBooks.POST(form('/api/admin/book', releaseForm))).status, 303);
  const adminMarkup = renderToStaticMarkup(await adminBooksPage.default({ searchParams: Promise.resolve({}) }));
  assert.equal(adminMarkup.includes('name="file_url"'), false);
  assert.equal((adminMarkup.match(/name="action" value="release"/g) ?? []).length, 1);
  assert.equal((adminMarkup.match(/<form\b/g) ?? []).length, 7); // create, search, price, offer, details, release, archive
  assert.equal((adminMarkup.match(/name="action" value="price"/g) ?? []).length, 1, "inline price form");
  assert.ok(adminMarkup.includes('id="existing-firstparty-release-submission"'));
  assert.ok(adminMarkup.includes('name="reason"'));
  assert.ok(adminMarkup.includes('name="confirmed"'));
  assert.equal((adminMarkup.match(/name="action" value="save"/g) ?? []).length, 1);
  assert.equal((adminMarkup.match(/name="action" value="archive"/g) ?? []).length, 1);
  assert.equal(adminMarkup.includes('id="test-released-title-title"'), false);
  const firstparty = (await db.query("select third_party,release_approved,file_sha256,file_format from books where slug='existing-firstparty'")).rows[0];
  assert.deepEqual(firstparty, { third_party: false, release_approved: true, file_sha256: registered[0].hash, file_format: 'PDF' });
  assert.equal((await adminBooks.POST(form('/api/admin/book', bookMetadata))).status, 303);
  assert.equal((await db.query("select release_approved from books where slug='existing-firstparty'")).rows[0].release_approved, true, 'editing details keeps a released book on sale');
  assert.equal((await adminBooks.POST(form('/api/admin/book', { ...bookMetadata, file_format: 'EPUB' }))).status, 303);
  assert.equal((await db.query("select release_approved from books where slug='existing-firstparty'")).rows[0].release_approved, false, 'changing the file format needs a new release');
  assert.equal((await adminBooks.POST(form('/api/admin/book', releaseForm))).status, 303);
  admin = false;
  assert.equal((await assets.GET(new Request(origin), { params: Promise.resolve({ id: registered[0].id }) })).status, 404);
  assert.equal((await assets.GET(new Request(origin), { params: Promise.resolve({ id: registered[1].id }) })).status, 200);
  assert.equal((await assets.GET(new Request(origin), { params: Promise.resolve({ id: registered[2].id }) })).status, 200);
  assert.equal((await content.POST(form('/api/admin/platform/content', { section: 'modules', action: 'save', title: 'Not admin' }))).status, 401);
  admin = true;
  assert.equal((await content.POST(form('/api/admin/platform/content', { section: 'media', action: 'save', title: 'Bad media', image_url: 'javascript:alert(1)' }))).status, 400);
  assert.equal((await content.POST(form('/api/admin/platform/content', { section: 'testimonials', action: 'save', title: 'A test quote', body: 'Test quote', payload: '{"attribution":"Test author"}', status: 'published' }))).status, 303);
  assert.equal((await dependencies['@/lib/content'].getPublicContent()).modules[0].type, 'testimonial');
  console.log('Publishing/admin APIs: bounded authenticated forms, metadata guards, reviewed first-party release, third-party visibility/audits, immutable purchases, private uploads, signed scans, and rendered forms passed. No provider calls.');
} finally {
  await db.close(); delete globalThis.publishingRouteDependencies;
  if (oldBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = oldBlobToken;
  if (oldScanSecret === undefined) delete process.env.SCAN_WEBHOOK_SECRET; else process.env.SCAN_WEBHOOK_SECRET = oldScanSecret;
}
