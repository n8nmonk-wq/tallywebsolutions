import { redirect } from "next/navigation";
import { Copy, Pause, Play, Plus, Archive, TicketPercent } from "lucide-react";
import { sql } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { rupees } from "@/lib/money";
import { isLive, offerBadge, type Offer } from "@/lib/offers";
import { listOffers, offerStats, offersReady } from "@/lib/offer-admin";
import AdminShell from "@/components/AdminShell";
import OfferForm from "./OfferForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offers", robots: { index: false, follow: false } };

const india = (v: string | null) => (v ? new Date(Date.parse(v) + 330 * 60000).toISOString().slice(0, 16).replace("T", " ") : "");
function status(o: Offer, now: Date): [string, string] {
  if (o.status === "archived") return ["Archived", "bg-ink-mute/10 text-ink-mute"];
  if (o.status === "draft") return ["Draft", "bg-ink-mute/10 text-ink-mute"];
  if (o.status === "paused") return ["Paused", "bg-gold/10 text-gold"];
  if (o.ends_at && Date.parse(o.ends_at) <= now.getTime()) return ["Ended", "bg-ink-mute/10 text-ink-mute"];
  if (o.starts_at && Date.parse(o.starts_at) > now.getTime()) return ["Scheduled", "bg-gold/10 text-gold"];
  if (!isLive(o, now)) return ["Used up", "bg-danger/10 text-danger"];
  return ["Live", "bg-brand/10 text-brand"];
}

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");
  const banner = <>{saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. Prices on the store are updated.</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert">{error}</p>}</>;
  if (!(await offersReady())) return <AdminShell active="offers" title="Offers" subtitle="Discounts, buy X get Y, bundles and coupon codes.">
    {banner}
    <section className="grid max-w-xl justify-items-start gap-3 rounded-xl border border-line bg-white p-6">
      <TicketPercent size={28} className="text-brand" aria-hidden="true" />
      <h2 className="text-lg font-semibold">Turn on offers</h2>
      <p className="text-sm text-ink-soft">Adds the offer tables to your database. Existing orders and prices are not changed.</p>
      <form action="/api/admin/offers" method="post"><input type="hidden" name="action" value="setup" /><button className="btn btn-primary" type="submit">Turn on offers</button></form>
    </section>
  </AdminShell>;

  const now = new Date();
  const [offers, stats, books, collections, categories] = await Promise.all([
    listOffers(), offerStats(),
    (async () => await sql`select slug, title from books where active order by title` as { slug: string; title: string }[])(),
    (async () => { try { return await sql`select slug, title as name from content_collections where status = 'published' order by sort, title` as { slug: string; name: string }[]; } catch { return []; } })(),
    (async () => await sql`select slug, name from categories where status <> 'archived' order by sort, name` as { slug: string; name: string }[])(),
  ]);
  const titles = new Map([...books.map((b) => [b.slug, b.title] as const), ...collections.map((c) => [c.slug, c.name] as const), ...categories.map((c) => [c.slug, c.name] as const)]);
  const target = (o: Offer) => o.scope === "all" ? "All books" : o.scope === "order" ? "Whole order"
    : `${o.scope === "books" ? "" : o.scope === "collection" ? "Collection: " : "Subject: "}${o.targets.slice(0, 3).map((t) => titles.get(t) ?? t).join(", ")}${o.targets.length > 3 ? ` +${o.targets.length - 3}` : ""}`;
  const action = (o: Offer, name: string, label: string, Icon: typeof Pause) => <form action="/api/admin/offers" method="post">
    <input type="hidden" name="action" value={name} /><input type="hidden" name="id" value={o.id} />
    <button className="btn btn-ghost !min-h-9 !px-3 !py-1.5 text-sm" type="submit"><Icon size={14} aria-hidden="true" />{label}</button></form>;

  return <AdminShell active="offers" title="Offers" subtitle="Discounts, buy X get Y, bundles and coupon codes. The best offer applies automatically.">
    {banner}
    <details className="mb-6 rounded-xl border border-line bg-white p-4" open={!offers.length}>
      <summary className="flex cursor-pointer items-center gap-2 font-medium"><Plus size={16} aria-hidden="true" /> New offer</summary>
      <div className="pt-4"><OfferForm books={books} collections={collections} categories={categories} /></div>
    </details>
    {!offers.length && <p className="text-sm text-ink-soft">No offers yet.</p>}
    <ul className="grid gap-3">{offers.map((o) => {
      const [label, tone] = status(o, now), s = stats[o.id] ?? { uses: 0, given: 0, revenue: 0 };
      return <li key={o.id} className="rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{o.name}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{label}</span><span className="pill-offer">{offerBadge({ ...o, code: null })}</span>
              {o.code && <span className="pill-offer">Code {o.code}</span>}</div>
            <p className="mt-1 text-sm text-ink-soft">{target(o)}{o.starts_at ? ` · from ${india(o.starts_at)}` : ""}{o.ends_at ? ` · until ${india(o.ends_at)}` : ""}
              {o.min_subtotal ? ` · min ${rupees(o.min_subtotal)}` : ""}{o.first_order_only ? " · first order" : ""}</p>
          </div>
          <dl className="grid grid-cols-3 gap-6 text-right text-sm">
            <div><dt className="text-ink-soft">Uses</dt><dd className="font-semibold">{s.uses}{o.usage_limit ? ` / ${o.usage_limit}` : ""}</dd></div>
            <div><dt className="text-ink-soft">Given</dt><dd className="font-semibold">{rupees(s.given)}</dd></div>
            <div><dt className="text-ink-soft">Revenue</dt><dd className="font-semibold">{rupees(s.revenue)}</dd></div>
          </dl>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          {o.status === "active" && action(o, "pause", "Pause", Pause)}
          {(o.status === "paused" || o.status === "draft") && action(o, "resume", "Go live", Play)}
          {action(o, "duplicate", "Duplicate", Copy)}
          {o.status !== "archived" && action(o, "archive", "Archive", Archive)}
        </div>
        {o.status !== "archived" && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Edit</summary>
          <div className="pt-4"><OfferForm offer={o} books={books} collections={collections} categories={categories} /></div></details>}
      </li>;
    })}</ul>
  </AdminShell>;
}
