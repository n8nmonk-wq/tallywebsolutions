import { sql, getOrder, getBook } from './db';
import { isSaleable } from './catalogue';
import { settleFromRazorpay } from './settle';

export async function recoverDelivery(orderId: string, action: string, reason: string, slug = '') {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderId) || reason.trim().length < 10 || reason.length > 2000) throw new Error('An order and a detailed recovery reason are required.');
  const order = await getOrder(orderId);
  if (!order || order.status === 'refunded') throw new Error('This order cannot be recovered.');
  if (action === 'reconcile') {
    await sql`insert into events(order_id,type,payload) values(${orderId},'admin.delivery.reconcile',${JSON.stringify({ reason })}::jsonb)`;
    await settleFromRazorpay(order);
    return;
  }
  if (action === 'snapshot') {
    const item = order.items.find(item => item.slug === slug);
    const book = await getBook(slug);
    if (!item || item.file_sha256 || !book || !isSaleable(book) || !['paid', 'fulfilled'].includes(order.status)
      || typeof book.file_sha256 !== 'string' || book.file_sha256.length !== 64 || !/^[a-f0-9]{64}$/i.test(book.file_sha256)
      || !/^(pdf|epub)$/i.test(book.file_format || '')) throw new Error('Only a missing snapshot or checksum can be restored from an approved edition with valid integrity metadata.');
    const checksumOnly = !!item.file_url;
    if (checksumOnly && (item.file_url !== book.file_url || item.file_format?.toLowerCase() !== book.file_format!.toLowerCase()
      || (item.edition || null) !== (book.edition || null))) throw new Error('Checksum repair requires the original file, format, and edition.');
    const checksum = book.file_sha256.toLowerCase();
    const snapshot = checksumOnly ? { file_sha256: checksum } : {
      file_url: book.file_url, file_format: book.file_format, edition: book.edition || null, file_sha256: checksum,
    };
    const rows = await sql`with restored as (
      update orders set items=(select jsonb_agg(case when entry->>'slug'=${slug} then
        entry || ${JSON.stringify(snapshot)}::jsonb else entry end order by position)
        from jsonb_array_elements(items) with ordinality as entries(entry,position))
      where id=${orderId} and status in ('paid','fulfilled')
        and exists(select 1 from jsonb_array_elements(items) entry where entry=${JSON.stringify(item)}::jsonb) returning id
    ), audit as (insert into events(order_id,type,payload) select id,'admin.delivery.snapshot.restored',${JSON.stringify({ reason, slug, edition: book.edition || null, file_sha256: checksum, repair: checksumOnly ? 'checksum' : 'snapshot' })}::jsonb from restored)
    select id from restored`;
    if (!rows.length) throw new Error('Order changed. Reload before restoring access.');
    return;
  }
  if (action === 'email') {
    const rows = await sql`with resumed as (
      update email_delivery set state='pending',attempts=0,first_attempt_at=null,next_attempt_at=now(),lease_until=null,claim_id=null
      where order_id=${orderId} and state='manual'
        and exists(select 1 from orders where id=${orderId} and status='fulfilled' and not is_dev)
        and not exists(select 1 from events where order_id=${orderId} and type='admin.email.reviewed' and created_at>now()-interval '1 day') returning order_id
    ), audit as (insert into events(order_id,type,payload) select order_id,'admin.email.reviewed',${JSON.stringify({ reason })}::jsonb from resumed)
    select order_id from resumed`;
    if (!rows.length) throw new Error('Manual email review is unavailable or was already used today.');
    return;
  }
  throw new Error('Unknown recovery action.');
}
