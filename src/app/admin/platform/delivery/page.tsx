import { sql } from '@/lib/db';
import { isAdmin } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';
import ActionForm from '@/components/ActionForm';
import { RefreshCw } from 'lucide-react';
export default async function DeliveryPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  const rows = await sql`select o.id,o.status,o.created_at,e.state email_state,e.attempts,e.last_error from orders o
    left join email_delivery e on e.order_id=o.id where o.status in ('created','paid','fulfilled')
    and (e.state in ('pending','manual','sending') or o.status in ('created','paid')
      or exists(select 1 from jsonb_array_elements(o.items) i where coalesce(i->>'file_url','')='')) order by o.created_at limit 100`;
  return <section>
    <p className="mt-4 mb-8 text-ink-soft">Provider reconciliation never creates another charge. Restore a legacy snapshot only after verifying that the approved file is the edition originally purchased.</p>
    {rows.length === 0 && <p>No orders need delivery recovery.</p>}
    {rows.map(row => <article key={row.id} className="border-b border-line py-6">
      <h2 className="break-all text-lg font-medium">{row.id}</h2><p className="mb-4 text-sm">{row.status} · Email: {row.email_state || 'Not queued'} · Attempts: {row.attempts || 0}</p>
      <ActionForm action="/api/admin/platform/delivery"><input type="hidden" name="id" value={row.id} />
        <label>Recovery action<select name="action" className="field-input mt-1"><option value="reconcile">Reconcile payment and provisioning</option><option value="snapshot">Restore missing purchased-file snapshot</option><option value="email">Release email retry after provider review</option></select></label>
        <label>Book slug (snapshot recovery only)<input name="slug" className="field-input mt-1" maxLength={100} /></label>
        <label>Recovery reason<textarea name="reason" className="field-input mt-1" required minLength={10} maxLength={2000} rows={3} /></label>
        <label className="flex items-start gap-3"><input type="checkbox" name="confirmed" required className="mt-1" /><span>I verified provider logs and the original purchased edition. For email retries I confirmed no prior delivery.</span></label>
        <button className="btn btn-primary justify-self-start"><RefreshCw size={18} aria-hidden />Recover delivery</button>
      </ActionForm></article>)}
  </section>;
}
