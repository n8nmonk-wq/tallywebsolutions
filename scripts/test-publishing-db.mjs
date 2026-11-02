import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  await db.exec("insert into books(slug,title,price_inr) values('existing-title','Existing title',100)");
  const migration = readFileSync(new URL('../migrations/003-publishing.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  assert.equal((await db.query("select count(*)::int count from information_schema.columns where table_name='books' and column_name='file_sha256'")).rows[0].count, 1, 'Publishing migration must add the manuscript checksum without the commerce migration');
  // Releases attribute the book to its author profile; the catalogue migration that adds author_slug follows in order.
  await db.exec(readFileSync(new URL('../migrations/004-catalogue.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../migrations/007-marketplace.sql', import.meta.url), 'utf8'));
  const defaults = (await db.query("select third_party,release_approved,scan_status from books where slug='existing-title'")).rows[0];
  assert.deepEqual(defaults, { third_party: false, release_approved: false, scan_status: 'pending' });
  globalThis.publishingTestSql = async (parts, ...values) => {
    const statement = parts.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    return (await db.query(statement, values)).rows;
  };
  async function load(path) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    return import('data:text/javascript;base64,' + Buffer.from(js.replace(/import \{ sql \} from ["']\.\/db["'];?/, 'const sql = globalThis.publishingTestSql;')).toString('base64'));
  }
  const s = await load('../src/lib/submissions.ts');
  const c = await load('../src/lib/content.ts');
  const q = async (statement, values = []) => (await db.query(statement, values)).rows;
  await assert.rejects(s.createDraft('reader-1', { title: 'A real submission fixture', description: 'Test only', price_inr: 500 }));
  await s.saveAuthorProfile('reader-1', 'Test author', 'Test biography');
  const id = await s.createDraft('reader-1', { title: 'A real submission fixture', description: 'Test only', price_inr: 500 });
  await assert.rejects(s.submitDraft('reader-1', id, 1, true));
  await assert.rejects(s.saveDraft('reader-2', id, 1, { title: 'Stolen edit', description: 'Test', price_inr: 500 }));
  assert.equal((await s.getAuthorSubmissions('reader-2')).length, 0);
  await s.saveDraft('reader-1', id, 1, { title: 'Revised title', description: 'Test only', price_inr: 600 });
  await assert.rejects(s.saveDraft('reader-1', id, 1, { title: 'Stale edit', description: 'Test', price_inr: 500 }));
  assert.equal((await q('select title from publishing_submissions where id=$1', [id]))[0].title, 'Revised title');
  for (const kind of ['manuscript', 'cover', 'sample']) await q(`insert into publishing_assets(id,submission_id,kind,blob_url,sha256,content_type,size_bytes)
    values($1,$2,$3,$4,$5,$6,100)`, [`asset-${kind}`, id, kind, `https://private.blob.vercel-storage.com/${kind}`, (kind === 'manuscript' ? 'a' : 'c').repeat(64), kind === 'cover' ? 'image/png' : 'application/pdf']);
  await assert.rejects(s.submitDraft('reader-1', id, 2, false));
  await s.submitDraft('reader-1', id, 2, true);
  await assert.rejects(s.saveDraft('reader-1', id, 3, { title: 'Late edit', description: 'Test', price_inr: 500 }));
  await assert.rejects(s.reviewSubmission(id, 3, 'approve', '', true, true));
  await s.reviewSubmission(id, 3, 'review', '', false, false);
  await s.reviewSubmission(id, 4, 'request_changes', 'Clarify rights', false, false);
  assert.equal((await s.getAuthorSubmissions('reader-1'))[0].review_notes, 'Clarify rights');
  const submittedAudit = (await q("select payload from publishing_audit where submission_id=$1 and action='submission.submitted'", [id]))[0];
  assert.equal(submittedAudit.payload.ownership_declared, true);
  await s.submitDraft('reader-1', id, 5, true);
  const declaration = (await q('select ownership_declared,ownership_declared_by,ownership_declared_at from publishing_submissions where id=$1', [id]))[0];
  assert.equal(declaration.ownership_declared, true);
  assert.equal(declaration.ownership_declared_by, 'reader-1');
  assert.ok(declaration.ownership_declared_at);
  await s.reviewSubmission(id, 6, 'review', 'Ready for review', false, false);
  await s.reviewSubmission(id, 7, 'approve', 'Editorial accepted', false, false);
  await assert.rejects(s.releaseSubmission(id, 8, 'released-title'));
  await q('update publishing_submissions set rights_approved=true,commercial_approved=true where id=$1', [id]);
  await assert.rejects(s.releaseSubmission(id, 8, 'released-title'));
  await q("update publishing_assets set scan_status='clean' where submission_id=$1", [id]);
  await assert.rejects(s.releaseSubmission(id, 8, 'released-title'));
  await q('update publishing_assets set reviewed=true where submission_id=$1', [id]);
  await q("update publishing_assets set scan_status='infected' where kind='sample' and submission_id=$1", [id]);
  await assert.rejects(s.releaseSubmission(id, 8, 'released-title'));
  await q("update publishing_assets set scan_status='clean' where kind='sample' and submission_id=$1", [id]);
  for (const column of ['ownership_declared', 'ownership_declared_by', 'ownership_declared_at']) {
    const saved = (await q(`select ${column} from publishing_submissions where id=$1`, [id]))[0][column];
    await q(`update publishing_submissions set ${column}=$2 where id=$1`, [id, column === 'ownership_declared' ? false : null]);
    await assert.rejects(s.releaseSubmission(id, 8, 'released-title'), error => error.status === 409);
    await q(`update publishing_submissions set ${column}=$2 where id=$1`, [id, saved]);
  }
  assert.equal((await q("select count(*)::int count from books where slug='released-title'"))[0].count, 0);
  await assert.rejects(s.releaseSubmission(id, 8, 'a'.repeat(102)), error => error.status === 400);
  assert.deepEqual((await q('select status,version from publishing_submissions where id=$1', [id]))[0], { status: 'approved', version: 8 });
  assert.equal((await q("select count(*)::int count from publishing_audit where submission_id=$1 and action='submission.released'", [id]))[0].count, 0);
  await s.releaseSubmission(id, 8, 'released-title');
  const book = (await q("select * from books where slug='released-title'"))[0];
  assert.equal(book.third_party, true);
  assert.equal(book.release_approved, true);
  assert.equal(book.file_sha256, 'a'.repeat(64));
  assert.equal(book.cover, '/api/submissions/assets/asset-cover');
  assert.equal(book.sample_url, '/api/submissions/assets/asset-sample');
  assert.equal(book.author_slug, (await q("select id from author_profiles where reader_id='reader-1'"))[0].id);
  assert.equal((await q('select status from publishing_submissions where id=$1', [id]))[0].status, 'released');
  await assert.rejects(s.releaseSubmission(id, 8, 'duplicate-title'));
  await assert.rejects(q("update books set file_url='https://evil.test/arbitrary.pdf' where slug='released-title'"));
  await assert.rejects(q("update books set file_sha256=null where slug='released-title'"));
  await assert.rejects(q("update books set file_sha256=$1 where slug='released-title'", ['b'.repeat(64)]));
  await q("update books set file_sha256=$1 where slug='released-title'", ['a'.repeat(64)]);
  await assert.rejects(q("update books set rights_approved=false where slug='released-title'"));
  await assert.rejects(q("insert into books(slug,title,price_inr,third_party,release_approved,rights_approved,commercial_approved,scan_status) values('bypass','Bypass',100,true,true,true,true,'clean')"));
  const actions = (await q('select action from publishing_audit where submission_id=$1 order by id', [id])).map(e => e.action);
  assert.deepEqual(actions, ['draft.created', 'draft.saved', 'submission.submitted', 'review', 'request_changes', 'submission.submitted', 'review', 'approve', 'submission.released']);
  await q(`insert into publishing_submissions(id,author_id,title,description,price_inr,status,ownership_declared,ownership_declared_by,ownership_declared_at,rights_approved,commercial_approved)
    select 'manual-submission',author_id,title,description,price_inr,'approved',ownership_declared,ownership_declared_by,ownership_declared_at,true,true from publishing_submissions where id=$1`, [id]);
  await q(`insert into publishing_assets(id,submission_id,kind,blob_url,sha256,content_type,size_bytes,scan_status,reviewed)
    select 'manual-' || kind,'manual-submission',kind,blob_url,sha256,content_type,size_bytes,'clean',true from publishing_assets where submission_id=$1 and kind in ('manuscript','cover')`, [id]);
  const manualInsert = hash => q(`insert into books(slug,title,price_inr,file_url,file_sha256,cover,third_party,release_approved,rights_approved,commercial_approved,scan_status,submission_id)
    values('manual-proof','Manual hash fixture',600,'https://private.blob.vercel-storage.com/manuscript',$1,'/api/submissions/assets/manual-cover',true,true,true,true,'clean','manual-submission')`, [hash]);
  await assert.rejects(manualInsert(null), /Third-party release/);
  await assert.rejects(manualInsert('b'.repeat(64)), /Third-party release/);
  await assert.rejects(manualInsert('c'.repeat(64)), /Third-party release/);
  await assert.rejects(manualInsert(''), /Third-party release/);
  for (const [column, invalid] of [['status', 'submitted'], ['ownership_declared', false], ['ownership_declared_by', null], ['ownership_declared_at', null], ['rights_approved', false], ['commercial_approved', false]]) {
    const saved = (await q(`select ${column} from publishing_submissions where id='manual-submission'`))[0][column];
    await q(`update publishing_submissions set ${column}=$1 where id='manual-submission'`, [invalid]);
    await assert.rejects(manualInsert('a'.repeat(64)), /Third-party release/);
    await q(`update publishing_submissions set ${column}=$1 where id='manual-submission'`, [saved]);
  }
  for (const [column, invalid, valid] of [['scan_status', 'pending', 'clean'], ['reviewed', false, true]]) {
    await q(`update publishing_assets set ${column}=$1 where id='manual-manuscript'`, [invalid]);
    await assert.rejects(manualInsert('a'.repeat(64)), /Third-party release/);
    await q(`update publishing_assets set ${column}=$1 where id='manual-manuscript'`, [valid]);
  }
  await manualInsert('a'.repeat(64));
  await q("delete from books where slug='manual-proof'");
  const boundarySlug = 'a'.repeat(101);
  await s.releaseSubmission('manual-submission', 1, boundarySlug);
  assert.equal((await q('select file_sha256 from books where slug=$1', [boundarySlug]))[0].file_sha256, 'a'.repeat(64));
  assert.deepEqual((await q("select status,book_slug,version from publishing_submissions where id='manual-submission'"))[0], { status: 'released', book_slug: boundarySlug, version: 2 });
  await q(`insert into publishing_submissions(id,author_id,title,description,price_inr,status,ownership_declared,ownership_declared_by,ownership_declared_at,rights_approved,commercial_approved)
    select 'firstparty-submission',author_id,title,description,price_inr,'approved',true,ownership_declared_by,ownership_declared_at,true,true from publishing_submissions where id=$1`, [id]);
  await q(`insert into publishing_assets(id,submission_id,kind,blob_url,sha256,content_type,size_bytes,scan_status,reviewed)
    select 'firstparty-' || kind,'firstparty-submission',kind,blob_url,sha256,content_type,size_bytes,'clean',true from publishing_assets where submission_id=$1`, [id]);
  const snapshot = [{ slug: 'existing-title', title: 'Purchased edition', price: 100, file_url: 'https://files.test/purchased.pdf', file_sha256: 'd'.repeat(64), file_format: 'PDF', edition: 'Purchased edition' }];
  await q("insert into orders(id,email,items,subtotal,total,status) values('purchased-order','reader@example.test',$1::jsonb,100,100,'fulfilled')", [JSON.stringify(snapshot)]);
  const releaseExisting = (slug = 'existing-title', reason = 'Reviewed first-party release', confirmed = true) => s.releaseExistingBook('firstparty-submission', slug, reason, confirmed);
  await assert.rejects(releaseExisting('existing-title', 'Reviewed release', false), error => error.status === 400);
  await assert.rejects(releaseExisting('existing-title', ''), error => error.status === 400);
  await assert.rejects(releaseExisting('missing-title'), error => error.status === 409);
  await assert.rejects(releaseExisting('released-title'), error => error.status === 409);
  for (const [column, invalid] of [['status', 'in_review'], ['ownership_declared', false], ['ownership_declared_by', null], ['ownership_declared_at', null], ['rights_approved', false], ['commercial_approved', false]]) {
    const saved = (await q(`select ${column} from publishing_submissions where id='firstparty-submission'`))[0][column];
    await q(`update publishing_submissions set ${column}=$1 where id='firstparty-submission'`, [invalid]);
    await assert.rejects(releaseExisting(), error => error.status === 409);
    await q(`update publishing_submissions set ${column}=$1 where id='firstparty-submission'`, [saved]);
  }
  for (const kind of ['manuscript', 'cover', 'sample']) {
    for (const [column, invalid, valid] of [['scan_status', 'infected', 'clean'], ['reviewed', false, true]]) {
      await q(`update publishing_assets set ${column}=$1 where id=$2`, [invalid, `firstparty-${kind}`]);
      await assert.rejects(releaseExisting(), error => error.status === 409);
      await q(`update publishing_assets set ${column}=$1 where id=$2`, [valid, `firstparty-${kind}`]);
    }
  }
  await q("update publishing_assets set content_type='application/epub+zip' where id='firstparty-manuscript'");
  await assert.rejects(releaseExisting(), error => error.status === 409);
  await q("update publishing_assets set content_type='application/pdf' where id='firstparty-manuscript'");
  await db.exec(`create function reject_release_audit() returns trigger language plpgsql as $$ begin if new.action='book.released' then raise exception 'Audit unavailable'; end if; return new; end $$;
    create trigger reject_release_audit before insert on publishing_audit for each row execute function reject_release_audit();`);
  await assert.rejects(releaseExisting(), /Audit unavailable/);
  await db.exec('drop trigger reject_release_audit on publishing_audit; drop function reject_release_audit();');
  assert.equal((await q("select release_approved from books where slug='existing-title'"))[0].release_approved, false);
  assert.deepEqual((await q("select status,version from publishing_submissions where id='firstparty-submission'"))[0], { status: 'approved', version: 1 });
  await releaseExisting();
  const existingBook = (await q("select * from books where slug='existing-title'"))[0];
  assert.equal(existingBook.title, 'Existing title');
  assert.equal(existingBook.price_inr, 100);
  assert.equal(existingBook.third_party, false);
  assert.equal(existingBook.release_approved, true);
  assert.equal(existingBook.file_url, 'https://private.blob.vercel-storage.com/manuscript');
  assert.equal(existingBook.file_sha256, 'a'.repeat(64));
  assert.equal(existingBook.file_format, 'PDF');
  assert.equal(existingBook.cover, '/api/submissions/assets/firstparty-cover');
  assert.equal(existingBook.sample_url, '/api/submissions/assets/firstparty-sample');
  assert.equal(existingBook.submission_id, 'firstparty-submission');
  assert.deepEqual((await q("select status,book_slug,version from publishing_submissions where id='firstparty-submission'"))[0], { status: 'released', book_slug: 'existing-title', version: 2 });
  const releaseAudit = (await q("select payload from publishing_audit where submission_id='firstparty-submission' and action='book.released'"))[0].payload;
  assert.equal(releaseAudit.slug, 'existing-title');
  assert.equal(releaseAudit.reason, 'Reviewed first-party release');
  assert.equal(releaseAudit.file_sha256, 'a'.repeat(64));
  await q("update books set release_approved=false where slug='existing-title'");
  await releaseExisting();
  assert.equal((await q("select release_approved from books where slug='existing-title'"))[0].release_approved, true);
  assert.deepEqual((await q("select items from orders where id='purchased-order'"))[0].items, snapshot);
  await c.saveContent('modules', 'm1', null, { title: 'Draft copy', type: 'text', body: 'Draft', status: 'draft' });
  await c.saveContent('modules', 'm2', null, { title: 'Scheduled copy', type: 'text', body: 'Later', status: 'published', publish_at: '2099-01-01T00:00:00Z' });
  await c.saveContent('media', 'm3', null, { title: 'Visible media', body: 'Visible', status: 'published' });
  await c.saveContent('testimonials', 'm4', null, { title: 'Test testimonial', body: 'Quote fixture', status: 'published', payload: { attribution: 'Test attribution' } });
  await c.saveContent('collections', '', null, { title: 'A shelf', slug: 'a-shelf', status: 'published', book_slugs: ['released-title', 'existing-title'] });
  await assert.rejects(c.saveContent('collections', '', null, { title: 'Invalid shelf', slug: 'bad-shelf', book_slugs: ['missing-book'] }));
  const publicContent = await c.getPublicContent();
  assert.deepEqual(publicContent.modules.map(m => m.id), ['m3', 'm4']);
  assert.deepEqual(publicContent.collections[0].book_slugs, ['released-title', 'existing-title']);
  assert.equal(publicContent.authors.length, 0);
  let record = (await c.getAdminContent('modules')).find(r => r.id === 'm1');
  await c.saveContent('modules', 'm1', record.updated_at, { title: 'Updated copy', type: 'text', status: 'published' });
  await assert.rejects(c.saveContent('modules', 'm1', record.updated_at, { title: 'Stale copy', type: 'text' }));
  record = (await c.getAdminContent('modules')).find(r => r.id === 'm1');
  await c.deleteContent('modules', 'm1', record.updated_at);
  assert.equal((await c.getAdminContent('modules')).some(r => r.id === 'm1'), false);
  const author = (await c.getAdminContent('authors'))[0];
  await assert.rejects(c.deleteContent('authors', author.id, author.updated_at));
  await c.saveContent('authors', author.id, author.updated_at, { title: 'Test author', body: 'Reviewed biography', status: 'published' });
  assert.equal((await c.getPublicContent()).authors[0].name, 'Test author');
  // Banner ordering: move swaps neighbours of the same type, is audited, and stops at the ends.
  for (const [id, sort] of [['b1', 0], ['b2', 0], ['b3', 5]]) await c.saveContent('modules', id, null, { title: `Banner ${id}`, type: 'banner', status: 'published', sort });
  const bannerOrder = async () => (await q("select id from content_modules where type='banner' order by sort, id")).map(r => r.id);
  assert.deepEqual(await bannerOrder(), ['b1', 'b2', 'b3']);
  await c.moveModule('b3', 'up');
  assert.deepEqual(await bannerOrder(), ['b1', 'b3', 'b2']);
  await c.moveModule('b1', 'up');
  assert.deepEqual(await bannerOrder(), ['b1', 'b3', 'b2'], 'the first banner cannot move further up');
  await c.moveModule('b1', 'down');
  assert.deepEqual(await bannerOrder(), ['b3', 'b1', 'b2']);
  assert.ok((await q("select count(*)::int n from publishing_audit where action='content.module.moved'"))[0].n >= 2);
  await assert.rejects(c.moveModule('m1', 'sideways'), /direction/);
  await assert.rejects(c.moveModule('missing', 'up'), /not found/i);
  console.log('Isolated publishing database: ownership, review, audited atomic release, bypass protection, scheduling, and CMS CRUD passed.');
} finally { await db.close(); delete globalThis.publishingTestSql; }
