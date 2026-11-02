import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { listOrders, parseOrderFilter } from "@/lib/admin-orders";
import { rupees } from "@/lib/money";
import AdminShell from "@/components/AdminShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders", robots: { index: false, follow: false } };
const PAGE = 25;

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const filter = parseOrderFilter(await searchParams);
  const { rows, total } = await listOrders(filter, PAGE);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (page: number) => `/admin/orders?${new URLSearchParams({ ...(filter.q && { q: filter.q }), ...(filter.status && { status: filter.status }),
    ...(filter.from && { from: filter.from }), ...(filter.to && { to: filter.to }), page: String(page) })}`;
  return <AdminShell active="orders" title="Orders" subtitle={`${total} orders`} actions={<a className="btn btn-ghost" href="/api/admin/export">Export CSV</a>}>
    <form className="mb-6 flex flex-wrap items-end gap-3" role="search">
      <label className="text-sm">Search<input name="q" defaultValue={filter.q} placeholder="Order ID, email or name" className="field-input mt-1" /></label>
      <label className="text-sm">Status<select name="status" defaultValue={filter.status} className="field-input mt-1"><option value="">Any</option>
        {["created", "paid", "fulfilled", "payment_failed", "refunded"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></label>
      <label className="text-sm">From<input type="date" name="from" defaultValue={filter.from} className="field-input mt-1" /></label>
      <label className="text-sm">To<input type="date" name="to" defaultValue={filter.to} className="field-input mt-1" /></label>
      <button className="btn btn-primary" type="submit">Filter</button>
    </form>
    <div className="overflow-x-auto rounded-lg border border-line bg-white"><table className="w-full text-sm">
      <thead><tr className="text-left text-ink-soft">{["Order", "Customer", "Items", "Total", "Status", "Date"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
      <tbody>{rows.map((o) => <tr key={o.id} className="border-t border-line">
        <td className="p-3"><Link className="underline" href={`/admin/orders/${encodeURIComponent(o.id)}`}>{o.id.slice(0, 10)}…</Link></td>
        <td className="p-3">{o.name || "—"}<br /><span className="text-ink-soft">{o.email}</span></td>
        <td className="p-3">{o.items.map((i) => i.title).join(", ")}</td>
        <td className="p-3">{rupees(o.total)}</td><td className="p-3">{o.status.replace("_", " ")}</td>
        <td className="p-3">{new Date(o.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td></tr>)}</tbody>
    </table>{!rows.length && <p className="p-6 text-sm">No orders match these filters.</p>}</div>
    <nav className="mt-4 flex gap-3 text-sm" aria-label="Pages">{filter.page > 1 && <Link href={href(filter.page - 1)}>Previous</Link>}
      <span>Page {filter.page} of {pages}</span>{filter.page < pages && <Link href={href(filter.page + 1)}>Next</Link>}</nav>
  </AdminShell>;
}
