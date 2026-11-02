import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createHmac } from 'node:crypto';
import { load as loadModule } from './test-commerce.mjs';

// Exercise the actual pure helpers without opening a database connection.
async function load(path, database = '() => { throw new Error("Unexpected database call"); }') {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js.replace(/import \{ sql \} from ["']\.\/db["'];?/, `const sql = ${database};`)).toString('base64'));
}
const s = await load('../src/lib/submissions.ts');
for (const slug of ['a'.repeat(102), 'a'.repeat(120), 'a'.repeat(121)]) {
  await assert.rejects(s.releaseSubmission('test-submission', 1, slug), error => error instanceof s.PublishingError && error.status === 400 && error.message === 'Invalid book slug.');
}
const approved = { status: 'approved', ownership_declared: true, rights_approved: true, commercial_approved: true, assets: [{ kind: 'manuscript', scan_status: 'clean', reviewed: true }, { kind: 'cover', scan_status: 'clean', reviewed: true }] };
assert.equal(s.canRelease(approved), true);
for (const gate of ['ownership_declared', 'rights_approved', 'commercial_approved']) assert.equal(s.canRelease({ ...approved, [gate]: false }), false);
assert.equal(s.canRelease({ ...approved, status: 'submitted' }), false);
assert.equal(s.canRelease({ ...approved, assets: [] }), false);
assert.equal(s.canRelease({ ...approved, assets: approved.assets.map(a => ({ ...a, scan_status: 'pending' })) }), false);
assert.equal(s.canRelease({ ...approved, assets: [...approved.assets, { kind: 'sample', scan_status: 'infected', reviewed: true }] }), false);
assert.equal(s.canRelease({ ...approved, assets: approved.assets.map(a => ({ ...a, reviewed: false })) }), false);
assert.equal(s.nextSubmissionStatus('draft', 'submit', 'author'), 'submitted');
assert.equal(s.nextSubmissionStatus('changes_requested', 'submit', 'author'), 'submitted');
assert.equal(s.nextSubmissionStatus('submitted', 'review', 'admin'), 'in_review');
assert.equal(s.nextSubmissionStatus('in_review', 'approve', 'admin'), 'approved');
assert.throws(() => s.nextSubmissionStatus('draft', 'approve', 'author'));
assert.throws(() => s.nextSubmissionStatus('approved', 'submit', 'author'));
assert.throws(() => s.nextSubmissionStatus('submitted', 'approve', 'admin'));
assert.equal(s.validateUploadBytes(Buffer.from('%PDF-1.7\n'), 'manuscript'), 'application/pdf');
assert.equal(s.validateUploadBytes(Buffer.from('%PDF-1.7\n'), 'sample'), 'application/pdf');
assert.throws(() => s.validateUploadBytes(Buffer.from('<script>'), 'manuscript'));
assert.throws(() => s.validateUploadBytes(Buffer.alloc(20 * 1024 * 1024 + 1), 'sample'));
assert.throws(() => s.validateUploadBytes(Buffer.alloc(5 * 1024 * 1024 + 1), 'cover'));
assert.throws(() => s.validateMetadata({ title: 'Title', description: 'Description', price_inr: 100, file_url: 'https://evil.test/paid.pdf' }));
assert.throws(() => s.validateMetadata({ title: 'Title', description: 'Description', price_inr: -1 }));
assert.throws(() => s.validateMetadata({ title: 'Title', description: 'Description', price_inr: null }));
assert.throws(() => s.validateMetadata({ title: 'Title', description: 'Description', price_inr: true }));
assert.equal(s.validateMetadata({ title: ' Title ', description: 'Copy', price_inr: 100 }).title, 'Title');
const body = JSON.stringify({ asset_id: 'asset', sha256: 'a'.repeat(64), status: 'clean' });
const time = '1791561600';
const signature = createHmac('sha256', 'secret').update(`${time}.${body}`).digest('hex');
assert.equal(s.verifyScanSignature(body, time, signature, 'secret', Number(time) * 1000), true);
assert.equal(s.verifyScanSignature(body + ' ', time, signature, 'secret', Number(time) * 1000), false);
assert.equal(s.verifyScanSignature(body, time, signature, '', Number(time) * 1000), false);
assert.equal(s.verifyScanSignature(body, time, signature, 'secret', (Number(time) + 301) * 1000), false);
await assert.rejects(s.readLimitedBody(new Request('https://test.local', { method: 'POST', body: '12345' }), 4), error => error.status === 413);
assert.equal(new TextDecoder().decode(await s.readLimitedBody(new Request('https://test.local', { method: 'POST', body: '1234' }), 4)), '1234');
const c = await load('../src/lib/content.ts');
assert.equal(c.safeUrl('/books'), '/books');
assert.equal(c.safeUrl('https://example.com/image.png'), 'https://example.com/image.png');
for (const url of ['javascript:alert(1)', '//evil.test', 'http://example.com', '/\\evil.test', 'data:text/html,bad']) assert.throws(() => c.safeUrl(url));
assert.equal(c.isPublicRecord({ status: 'published', publish_at: null }), true);
assert.equal(c.isPublicRecord({ status: 'draft', publish_at: null }), false);
assert.equal(c.isPublicRecord({ status: 'published', publish_at: '2099-01-01' }), false);
assert.throws(() => c.validateContent('modules', { title: 'X', type: 'made_up' }));
assert.throws(() => c.validateContent('collections', { title: 'X', slug: 'Bad Slug', book_slugs: [] }));
assert.throws(() => c.validateContent('modules', { title: 'X', type: 'hero', payload: { html: '<script>' } }));
assert.throws(() => c.validateContent('modules', { title: 'X', type: 'media', payload: { video_url: 'javascript:alert(1)' } }));
assert.equal(c.validateContent('modules', { title: 'X', type: 'media', payload: { video_url: '/media/interview.mp4' } }).payload.video_url, '/media/interview.mp4');
const content = loadModule('src/lib/content.ts', { './db': { sql() { throw new Error('no db'); } } });
const promo = content.validateContent('modules', { title: 'Science week', type: 'promo', status: 'published',
  payload: { size: 'large', theme: 'sky', category_slug: 'science' }, ends_at: '2026-10-20T00:00:00+05:30' });
assert.equal(promo.type, 'promo');
assert.equal(promo.ends_at, '2026-10-20T00:00:00+05:30');
assert.throws(() => content.validateContent('modules', { title: 'x', type: 'promo', payload: { theme: 'neon' } }), /theme/);
assert.throws(() => content.validateContent('modules', { title: 'x', type: 'promo', payload: { size: 'huge' } }), /size/);
assert.throws(() => content.validateContent('modules', { title: 'x', type: 'genre-switcher', payload: { category_slugs: Array(9).fill('a') } }), /categor/);
assert.throws(() => content.validateContent('modules', { title: 'x', publish_at: '2026-10-21T00:00:00Z', ends_at: '2026-10-20T00:00:00Z' }), /end/);
const helpers = loadModule('src/components/content-data.ts', { '@/lib/content': content });
const base = { id: 'm', type: 'banner', title: 't', status: 'published', publish_at: null, sort: 0, payload: {} };
assert.equal(helpers.publicModules([{ ...base, ends_at: '2026-10-14T00:00:00Z' }], new Date('2026-10-15T00:00:00Z')).length, 0);
assert.equal(helpers.publicModules([{ ...base, ends_at: '2026-10-16T00:00:00Z' }], new Date('2026-10-15T00:00:00Z')).length, 1);
console.log('Publishing transitions, release gates, upload limits, signed scans, and content validation passed.');
for (const table of ['content_modules', 'content_collections', 'author_profiles']) {
  const legacy = await load('../src/lib/content.ts', `async () => { throw Object.assign(new Error('relation "${table}" does not exist'), { code: '42P01' }); }`);
  assert.deepEqual(await legacy.getPublicContent(), { modules: [], collections: [], authors: [] });
}
for (const [code, message] of [['42P01', 'relation "books" does not exist'], ['08006', 'connection failed'], ['42501', 'permission denied']]) {
  const failed = await load('../src/lib/content.ts', `async () => { throw Object.assign(new Error(${JSON.stringify(message)}), { code: '${code}' }); }`);
  await assert.rejects(failed.getPublicContent(), error => error.code === code);
}
console.log('Missing optional CMS tables degrade gracefully; catalogue and connection failures remain visible.');
