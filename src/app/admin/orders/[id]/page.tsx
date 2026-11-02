import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { getOrder, sql } from "@/lib/db";
import { rupees } from "@/lib/money";
import AdminShell from "@/components/AdminShell";

export const dynamic = "force-dynamic";
export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const order = await getOrder((await params).id);
  if (!order) notFound();
  const events = await sql`select type, created_at::text from events where order_id=${order.id} order by created_at desc limit 50` as { type: string; created_at: string }[];
  return <AdminShell active="orders" title={`Order ${order.id.slice(0, 10)}…`} subtitle={`${order.status.replace("_", " ")} · ${order.email}`}>
    <section className="mb-8 rounded-lg border border-line bg-white p-5"><h2 className="mb-3 font-semibold">Items (as purchased)</h2>
      <ul className="grid gap-2 text-sm">{order.items.map((i) => <li key={i.slug} className="flex justify-between gap-4"><span>{i.title}{i.edition ? ` · ${i.edition}` : ""}</span>
        <span>{"list_price" in i && typeof i.list_price === "number" && i.list_price > i.price ? <><s className="mr-2 text-ink-soft">{rupees(i.list_price)}</s>{rupees(i.price)}</> : rupees(i.price)}</span></li>)}</ul>
      <p className="mt-4 text-sm">Subtotal {rupees(order.subtotal)} · Tax {rupees(order.tax)} · <strong>Total {rupees(order.total)}</strong></p></section>
    <section className="rounded-lg border border-line bg-white p-5"><h2 className="mb-3 font-semibold">History</h2>
      <ul className="grid gap-1 text-sm">{events.map((e, n) => <li key={n}>{new Date(e.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {e.type}</li>)}</ul></section>
  </AdminShell>;
}
