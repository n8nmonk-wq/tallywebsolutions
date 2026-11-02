import assert from 'node:assert/strict';
import { createIsolatedDatabase } from './isolated-db.mjs';
import { load } from './test-commerce.mjs';

const { db, directory } = await createIsolatedDatabase();
Object.assign(process.env, { NODE_ENV: 'test', PGLITE_DATABASE_DIR: directory, DATABASE_URL: '' });
globalThis.readingRoomDatabase = db;
const { recoverDelivery } = await import('../src/lib/recovery.ts');
try {
  const checksum = 'a'.repeat(64);
  await db.query(`insert into books(slug,title,price_inr,file_url,file_format,file_sha256,release_approved,scan_status) values('original-edition','Edition',100,'private:approved.pdf','PDF',$1,true,'clean')`, [checksum]);
  await db.query(`insert into orders(id,email,items,subtotal,total,status) values('legacy-order','reader@example.com',$1::jsonb,100,100,'fulfilled')`, [JSON.stringify([{ slug: 'original-edition', title: 'Edition', price: 100 }])]);
  await recoverDelivery('legacy-order', 'snapshot', 'Verified original edition with historical support records', 'original-edition');
  const order = (await db.query(`select items from orders where id='legacy-order'`)).rows[0];
  assert.equal(order.items[0].file_url, 'private:approved.pdf');
  assert.equal(order.items[0].file_format, 'PDF');
  assert.equal(order.items[0].file_sha256, checksum);
  await assert.rejects(() => recoverDelivery('legacy-order', 'snapshot', 'Must not silently replace purchased files', 'original-edition'));
  assert.equal((await db.query(`select count(*)::int n from events where type='admin.delivery.snapshot.restored'`)).rows[0].n, 1);
  const purchased = { slug: 'original-edition', title: 'Purchased title', price: 100, file_url: 'private:approved.pdf', file_format: 'pdf', edition: null };
  const setItems = items => db.query(`update orders set items=$1::jsonb where id='legacy-order'`, [JSON.stringify(items)]);
  const getItems = async () => (await db.query(`select items from orders where id='legacy-order'`)).rows[0].items;
  await setItems([purchased, { slug: 'other-edition', title: 'Other', price: 200 }]);
  const reason = 'Historical file, format and edition verified before checksum repair';
  await recoverDelivery('legacy-order', 'snapshot', reason, 'original-edition');
  assert.deepEqual(await getItems(), [{ ...purchased, file_sha256: checksum }, { slug: 'other-edition', title: 'Other', price: 200 }]);
  const audit = (await db.query(`select payload from events where type='admin.delivery.snapshot.restored' order by id`)).rows;
  assert.equal(audit[0].payload.repair, 'snapshot');
  assert.deepEqual(audit[1].payload, { reason, slug: 'original-edition', edition: null, file_sha256: checksum, repair: 'checksum' });
  for (const patch of [{ file_url: 'private:different.pdf' }, { file_format: 'EPUB' }, { edition: 'Different edition' }, { file_sha256: 'b'.repeat(64) }, { file_sha256: 'malformed' }]) {
    const items = [{ ...purchased, ...patch }];
    await setItems(items);
    await assert.rejects(() => recoverDelivery('legacy-order', 'snapshot', reason, 'original-edition'));
    assert.deepEqual(await getItems(), items);
  }
  await setItems([purchased]);
  const book = (await db.query(`select * from books where slug='original-edition'`)).rows[0];
  const sql = async (parts, ...values) => (await db.query(parts.reduce((s, part, i) => s + (i ? `$${i}` : '') + part, ''), values)).rows;
  const getOrder = async () => (await db.query(`select * from orders where id='legacy-order'`)).rows[0];
  for (const invalid of [null, '', 'a'.repeat(63), 'g'.repeat(64), 'a'.repeat(65)]) {
    const recovery = load('src/lib/recovery.ts', { './db': { sql, getOrder, getBook: async () => ({ ...book, file_sha256: invalid }) }, './settle': {} });
    await assert.rejects(() => recovery.recoverDelivery('legacy-order', 'snapshot', reason, 'original-edition'));
    assert.deepEqual(await getItems(), [purchased]);
  }
  const concurrent = { ...purchased, file_url: 'private:concurrent.pdf' };
  const recovery = load('src/lib/recovery.ts', { './db': { sql, getOrder: async () => {
    const before = await getOrder();
    await setItems([concurrent]);
    return before;
  }, getBook: async () => book }, './settle': {} });
  await assert.rejects(() => recovery.recoverDelivery('legacy-order', 'snapshot', reason, 'original-edition'), /Order changed/);
  assert.deepEqual(await getItems(), [concurrent]);
  assert.equal((await db.query(`select count(*)::int n from events where type='admin.delivery.snapshot.restored'`)).rows[0].n, 2);
  await db.query(`insert into email_delivery(order_id,payload,state,attempts) values('legacy-order','{}','manual',8)`);
  await recoverDelivery('legacy-order', 'email', 'Provider logs confirm no previous email delivery');
  assert.equal((await db.query(`select state from email_delivery`)).rows[0].state, 'pending');
  await db.query(`update email_delivery set state='manual'`);
  await assert.rejects(() => recoverDelivery('legacy-order', 'email', 'Repeated manual retries must be blocked today'));
  await db.query(`update orders set status='refunded' where id='legacy-order'`);
  await setItems([purchased]);
  await assert.rejects(() => recoverDelivery('legacy-order', 'snapshot', reason, 'original-edition'));
  assert.deepEqual(await getItems(), [purchased]);
  await assert.rejects(() => recoverDelivery('legacy-order', 'email', 'Refunded access cannot be recovered'));
  console.log('Actual recovery functions: checksummed snapshots, audited checksum-only repair, concurrent edit protection, bounded retries, and refund protection passed.');
} finally { await db.close(); }
