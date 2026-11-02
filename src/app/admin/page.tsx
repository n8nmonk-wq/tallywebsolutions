import { sql } from "@/lib/db";
import { rupees } from "@/lib/money";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import AdminShell from "@/components/AdminShell";
import StatCard from "@/components/StatCard";
import { checkoutProblems } from "@/lib/razorpay";
import { demoCount } from "@/lib/demo-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function Admin({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { demo } = await searchParams;
  const demoBooks = await demoCount().catch(() => 0);

  // One round of parallel queries instead of six in a row: each query to the database costs a network round trip.
  const [ordersRows, totalsRows, convRows, downloadRows, eventRows, healthRows] = await Promise.all([
    sql`select id, name, email, phone, total, status, created_at, items from orders order by created_at desc limit 100`,
    sql`select coalesce(sum(total),0)::int as revenue, count(*)::int as units from orders where status in ('paid','fulfilled')`,
    sql`select count(*)::int as started from orders`,
    sql`select book_slug, sum(count)::int as total_downloads, count(*)::int as active_orders from downloads group by book_slug order by total_downloads desc`,
    sql`select id, order_id, type, payload, created_at from events order by created_at desc limit 40`,
    sql`select
    (select count(*)::int from orders where status='paid') incomplete,
    (select count(*)::int from email_delivery where state in ('pending','sending','manual')) email_pending,
    (select count(*)::int from payment_attempts where state in ('creating','unknown')) reconciliation,
    (select count(*)::int from events where type='download.failed' and created_at>now()-interval '1 day') download_errors`,
  ]);
  const orders = ordersRows as { id: string; name: string | null; email: string; phone: string | null; total: number; status: string; created_at: string; items: { title: string }[] }[];
  const [totals] = totalsRows as { revenue: number; units: number }[];
  const [conv] = convRows as { started: number }[];
  const downloadStats = downloadRows as { book_slug: string; total_downloads: number; active_orders: number }[];
  const recentEvents = eventRows as { id: number; order_id: string | null; type: string; payload: Record<string, unknown>; created_at: string }[];
  const [health] = healthRows as Record<string, number>[];
  const rate = conv.started ? Math.round((totals.units / conv.started) * 100) : 0;
  const allDownloads = downloadStats.reduce((a, d) => a + d.total_downloads, 0);
  const exportHref = "/api/admin/export";
  const checkoutIssues = checkoutProblems();

  return (
    <AdminShell
      active="overview"
      title="Overview"
      subtitle="Sales, downloads and the audit trail."
      actions={
        <a className="btn btn-ghost" href={exportHref}>
          Export CSV <span aria-hidden>&darr;</span>
        </a>
      }
    >
      <section className={`mb-6 rounded-xl border px-5 py-4 ${checkoutIssues.length ? "border-danger/30 bg-danger/5" : "border-brand/30 bg-brand/5"}`} aria-labelledby="checkout-status">
        <h2 id="checkout-status" className="text-base font-semibold">{checkoutIssues.length ? "Checkout is off: customers see \"Online ordering is currently unavailable\"" : "Checkout is on"}</h2>
        {checkoutIssues.length > 0 && <>
          <p className="mt-1 text-sm text-ink-soft">Fix these in Vercel, then Settings, then Environment Variables (Production), and redeploy:</p>
          <ul className="mt-2 grid gap-1 font-mono text-[13px]">{checkoutIssues.map((issue) => <li key={issue}>• {issue}</li>)}</ul>
        </>}
      </section>
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white px-5 py-4" aria-labelledby="demo-status">
        <div><h2 id="demo-status" className="text-base font-semibold">Demo catalogue {demoBooks > 0 ? `· ${demoBooks} preview titles live` : "· off"}</h2>
          <p className="text-sm text-ink-soft">{demo === "failed" ? "That did not work. Try again." : "Fictional titles, subjects, authors and banners to preview the full store. They show prices but can't be bought."}</p></div>
        <form action="/api/admin/demo" method="post"><input type="hidden" name="action" value={demoBooks > 0 ? "remove" : "load"} />
          <button className={demoBooks > 0 ? "btn btn-ghost" : "btn btn-primary"} type="submit">{demoBooks > 0 ? "Remove demo catalogue" : "Load demo catalogue"}</button></form>
      </section>
      <section className="mb-8 border-b border-line pb-6"><h2 className="title title-md">Delivery health</h2>
        <p className="my-3">Incomplete paid orders: {health.incomplete} · Pending email: {health.email_pending} · Payment reconciliation: {health.reconciliation} · Download errors today: {health.download_errors}</p>
        <a href="/admin/platform/delivery" className="text-link">Review delivery recovery</a>
      </section>
      <div className="mb-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={rupees(totals.revenue)} accent />
        <StatCard
          label="Paid orders"
          value={totals.units}
          hint={conv.started + " started"}
        />
        <StatCard label="Conversion" value={rate + "%"} hint="paid of started" />
        <StatCard
          label="Downloads"
          value={allDownloads}
          hint={downloadStats.length + " titles"}
        />
      </div>

      {downloadStats.length > 0 && (
        <section className="mb-12">
          <h2 className="title title-md mb-4">Per title</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {downloadStats.map((d) => (
              <StatCard
                key={d.book_slug}
                label={d.book_slug.replace(/-/g, " ")}
                value={d.total_downloads}
                hint={d.active_orders + " orders"}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mb-12">
        <h2 className="title title-md mb-4">Orders</h2>
        <div className="overflow-x-auto rounded-3 border border-line">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Recent orders</caption>
            <thead>
              <tr className="bg-bg-2">
                {["Order", "Customer", "Contact", "Book", "Total", "Status", "When"].map(
                  (h) => (
                    <th
                      key={h}
                      scope="col"
                      className="eyebrow border-b border-line-2 px-4 py-3 text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-bg-2/60">
                  <td className="border-b border-line px-4 py-3">
                    <a
                      className="font-mono underline hover:text-brand"
                      href={"/order/" + o.id}
                    >
                      {o.id.slice(0, 10)}
                    </a>
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    {o.name ?? "—"}
                  </td>
                  <td className="border-b border-line px-4 py-3 text-ink-soft">
                    {o.email}
                    {o.phone && (
                      <>
                        <br />
                        <span className="font-mono text-xs">{o.phone}</span>
                      </>
                    )}
                  </td>
                  <td className="border-b border-line px-4 py-3 max-w-[220px] truncate">
                    {o.items?.[0]?.title ?? "—"}
                  </td>
                  <td className="border-b border-line px-4 py-3 font-mono whitespace-nowrap">
                    {rupees(o.total)}
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <span
                      className={
                        "inline-block rounded-1 px-2 py-0.5 font-mono text-xs font-medium " +
                        (o.status === "fulfilled" || o.status === "paid"
                          ? "bg-brand/10 text-brand"
                          : o.status === "payment_failed"
                            ? "bg-danger/10 text-danger"
                            : "bg-ink-mute/10 text-ink-mute")
                      }
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="border-b border-line px-4 py-3 text-ink-soft whitespace-nowrap">
                    {new Date(o.created_at).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="p-6 text-ink-soft">No orders yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="title title-md mb-4">Audit trail</h2>
        <div className="overflow-x-auto rounded-3 border border-line">
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="bg-bg-2">
                {["Time", "Type", "Order", "Payload"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="eyebrow border-b border-line-2 px-4 py-3 text-left text-[10px]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((ev) => (
                <tr key={ev.id} className="transition-colors hover:bg-bg-2/60">
                  <td className="border-b border-line px-4 py-2.5 whitespace-nowrap text-ink-soft">
                    {new Date(ev.created_at).toLocaleString("en-IN")}
                  </td>
                  <td className="border-b border-line px-4 py-2.5 font-semibold text-brand">
                    {ev.type}
                  </td>
                  <td className="border-b border-line px-4 py-2.5 text-ink-soft">
                    {ev.order_id ? (
                      <a href={"/order/" + ev.order_id} className="underline">
                        {ev.order_id.slice(0, 10)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="border-b border-line px-4 py-2.5 max-w-[380px] truncate text-ink-soft">
                    {JSON.stringify(ev.payload)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentEvents.length === 0 && (
            <p className="p-6 text-ink-soft">No events yet.</p>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
