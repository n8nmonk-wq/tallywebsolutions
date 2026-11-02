import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { rupees } from "@/lib/money";
import { getAnalytics, parseRange, type Kpis } from "@/lib/analytics";
import AdminShell from "@/components/AdminShell";
import RevenueChart from "./RevenueChart";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics", robots: { index: false, follow: false } };

const PRESETS = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["12m", "12 months"]] as const;
const todayIndia = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

function Delta({ now, before, money = false }: { now: number; before: number; money?: boolean }) {
  if (!before) return <span className="text-xs text-ink-soft">{now ? "new this period" : "—"}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  return <span className={`text-xs font-medium ${pct >= 0 ? "text-brand" : "text-danger"}`}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}% <span className="font-normal text-ink-soft">vs {money ? rupees(before) : before}</span></span>;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const range = parseRange(await searchParams, todayIndia());
  const a = await getAnalytics(range);
  const tiles: [string, keyof Kpis, boolean, string?][] = [["Revenue", "revenue", true], ["Paid orders", "orders", false], ["Average order", "aov", true],
    ["Conversion", "conversion", false, "%"], ["Discounts given", "discount", true], ["Refunds", "refunds", true]];
  return <AdminShell active="analytics" title="Analytics" subtitle="Paid orders only, in India time. Test and demo orders are left out.">
    <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
      {PRESETS.map(([v, label]) => <Link key={v} href={`/admin/analytics?range=${v}`} className={`chip ${range.preset === v ? "!bg-forest !text-cream" : ""}`}>{label}</Link>)}
      <label className="ml-auto text-sm">From<input type="date" name="from" defaultValue={range.from} className="field-input mt-1 !min-h-10" /></label>
      <label className="text-sm">To<input type="date" name="to" defaultValue={range.to} className="field-input mt-1 !min-h-10" /></label>
      <button className="btn btn-ghost !min-h-10" type="submit">Apply</button>
    </form>
    <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{tiles.map(([label, key, money, suffix]) =>
      <div key={key} className="rounded-xl border border-line bg-white p-5">
        <p className="text-sm text-ink-soft">{label}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight">{money ? rupees(a.kpis[key]) : `${a.kpis[key]}${suffix ?? ""}`}</p>
        {key === "conversion" ? <span className="text-xs text-ink-soft">{a.kpis.orders} paid of {a.kpis.started} started</span>
          : key === "refunds" ? <span className="text-xs text-ink-soft">{a.kpis.refundCount} {a.kpis.refundCount === 1 ? "order" : "orders"}</span>
          : <Delta now={a.kpis[key]} before={a.previous[key]} money={money} />}
      </div>)}</div>
    <section className="mb-8 rounded-xl border border-line bg-white p-5"><h2 className="mb-3 font-semibold">Revenue per day</h2><RevenueChart daily={a.daily} /></section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-white p-5"><h2 className="mb-3 font-semibold">Top books</h2>
        {a.topBooks.length ? <table className="w-full text-left text-sm"><thead><tr className="text-ink-soft"><th className="py-1 font-normal">Add-on</th><th className="font-normal">Sold</th><th className="text-right font-normal">Revenue</th></tr></thead>
          <tbody>{a.topBooks.map((b) => <tr key={b.slug} className="border-t border-line"><td className="py-2 pr-2">{b.title}</td><td>{b.units}</td><td className="text-right font-medium">{rupees(b.revenue)}</td></tr>)}</tbody></table>
          : <p className="text-sm text-ink-soft">No sales in this period.</p>}</section>
      <section className="rounded-xl border border-line bg-white p-5"><h2 className="mb-3 font-semibold">Offers</h2>
        {a.offers.length ? <table className="w-full text-left text-sm"><thead><tr className="text-ink-soft"><th className="py-1 font-normal">Offer</th><th className="font-normal">Uses</th><th className="font-normal">Given</th><th className="text-right font-normal">Revenue</th></tr></thead>
          <tbody>{a.offers.map((o) => <tr key={o.id} className="border-t border-line"><td className="py-2 pr-2">{o.name}</td><td>{o.uses}</td><td>{rupees(o.given)}</td><td className="text-right font-medium">{rupees(o.revenue)}</td></tr>)}</tbody></table>
          : <p className="text-sm text-ink-soft">No offers used in this period. <Link className="underline" href="/admin/offers">Manage offers</Link></p>}</section>
    </div>
  </AdminShell>;
}
