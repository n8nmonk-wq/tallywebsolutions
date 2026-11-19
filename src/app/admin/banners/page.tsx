import { redirect } from "next/navigation";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { isAdmin } from "@/lib/admin-auth";
import { getAdminContent } from "@/lib/content";
import AdminShell from "@/components/AdminShell";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import ImageField from "@/components/ImageField";

export const dynamic = "force-dynamic";
export const metadata = { title: "Banners", robots: { index: false, follow: false } };

type Banner = { id: string; title: string; body: string | null; image_url: string | null; mobile_image_url: string | null; link_url: string | null; link_label: string | null;
  payload: Record<string, unknown>; sort: number; status: string; publish_at: string | null; ends_at: string | null; updated_at: string };

// Where a banner shows on the homepage. Side cards sit beside the hero; without one, the store shows a product there.
const PLACEMENTS = { hero: "Hero (rotating, top of the homepage)", "side-1": "Side card 1 (top right)", "side-2": "Side card 2 (bottom right)" } as const;
const placementOf = (b?: Banner) => (typeof b?.payload?.placement === "string" && b.payload.placement in PLACEMENTS ? b.payload.placement : "hero") as keyof typeof PLACEMENTS;

// Payload settings this form does not edit (set under Homepage sections); sent back unchanged so saving keeps them.
const KEPT_PAYLOAD = ["attribution", "collection_slug", "author_id", "video_url", "theme", "size", "category_slug"];

// Stored instants are shown and entered in India time.
function toIndiaInput(value: string | null) {
  if (!value) return "";
  const t = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
  if (!Number.isFinite(t)) return "";
  return new Date(t + 330 * 60000).toISOString().slice(0, 16);
}
const isLive = (b: Banner, now = Date.now()) => b.status === "published" && (!b.publish_at || Date.parse(b.publish_at.replace(" ", "T")) <= now) && (!b.ends_at || Date.parse(b.ends_at.replace(" ", "T")) > now);

export default async function BannersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");
  const banners = (await getAdminContent("modules") as unknown as Banner[]).filter((m) => (m as unknown as { type: string }).type === "banner");
  return <AdminShell active="banners" title="Banners" subtitle="Images for the homepage hero and the two side cards. Upload your own artwork; live banners show in this order.">
    {saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The homepage is updated.</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert">{error}</p>}
    <details className="mb-6 rounded-xl border border-line bg-white p-4" open={!banners.length}>
      <summary className="flex cursor-pointer items-center gap-2 font-medium"><Plus size={16} aria-hidden="true" /> New banner</summary>
      <div className="pt-4"><BannerForm /></div>
    </details>
    {!banners.length && <p className="text-sm text-ink-soft">No banners yet. Without one, the homepage shows its default hero.</p>}
    <ol className="grid gap-3">{banners.map((b, i) => <li key={b.id} className="rounded-xl border border-line bg-white p-4">
      <div className="grid items-start gap-4 md:grid-cols-[220px_minmax(0,1fr)_auto]">
        <div className="relative aspect-[16/7] overflow-hidden rounded-lg bg-bg-3">
          {b.image_url ? <img src={b.image_url} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center bg-bg-2 text-xs text-ink-soft">No image yet</span>}
          {b.image_url && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-[13px] font-medium text-white">{b.title}</span>}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{b.title}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${isLive(b) ? "bg-brand/10 text-brand" : "bg-bg-3 text-ink-soft"}`}>{isLive(b) ? "Live" : b.status === "published" ? "Scheduled or ended" : b.status}</span>
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-soft">{PLACEMENTS[placementOf(b)].split(" (")[0]}</span>{!b.image_url && <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-xs text-gold">No image</span>}</div>
          {typeof b.payload?.subtitle === "string" && <p className="text-sm text-ink-soft">{b.payload.subtitle}</p>}
          <p className="mt-1 text-sm text-ink-soft">{b.link_url ? `Links to ${b.link_url}` : "No link"}{b.publish_at ? ` · from ${toIndiaInput(b.publish_at).replace("T", " ")}` : ""}{b.ends_at ? ` · until ${toIndiaInput(b.ends_at).replace("T", " ")}` : ""}</p>
        </div>
        <div className="flex gap-2">
          {(["up", "down"] as const).map((direction) => <form key={direction} action="/api/admin/platform/content" method="post">
            <input type="hidden" name="section" value="modules" /><input type="hidden" name="id" value={b.id} /><input type="hidden" name="action" value="move" />
            <input type="hidden" name="direction" value={direction} /><input type="hidden" name="return_to" value="/admin/banners" />
            <button type="submit" className="round-btn" aria-label={`Move ${b.title} ${direction}`} disabled={direction === "up" ? i === 0 : i === banners.length - 1}>
              {direction === "up" ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />}</button></form>)}
        </div>
      </div>
      <details className="mt-3 border-t border-line pt-3"><summary className="cursor-pointer text-sm font-medium">Edit</summary><div className="pt-4"><BannerForm banner={b} /></div></details>
    </li>)}</ol>
  </AdminShell>;
}

function BannerForm({ banner }: { banner?: Banner }) {
  const input = "field-input mt-1";
  return <form action="/api/admin/platform/content" method="post" className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="section" value="modules" /><input type="hidden" name="type" value="banner" />
    <input type="hidden" name="id" value={banner?.id ?? ""} /><input type="hidden" name="updated_at" value={banner?.updated_at ?? ""} />
    <input type="hidden" name="sort" value={String(banner?.sort ?? 1000)} /><input type="hidden" name="return_to" value="/admin/banners" />
    {KEPT_PAYLOAD.filter((k) => typeof banner?.payload?.[k] === "string" && banner.payload[k]).map((k) => <input key={k} type="hidden" name={k} value={String(banner!.payload[k])} />)}
    {Array.isArray(banner?.payload?.category_slugs) && (banner.payload.category_slugs as unknown[]).map((c) => <input key={`c-${String(c)}`} type="hidden" name="category_slugs" value={String(c)} />)}
    <label className="text-sm">Headline<input name="title" required maxLength={200} className={input} defaultValue={banner?.title ?? ""} placeholder="GST season offers" /></label>
    <label className="text-sm">Small label above<input name="subtitle" maxLength={200} className={input} defaultValue={typeof banner?.payload?.subtitle === "string" ? banner.payload.subtitle : ""} placeholder="Limited time" /></label>
    <label className="text-sm sm:col-span-2">One line of text<input name="body" maxLength={160} className={input} defaultValue={banner?.body ?? ""} placeholder="Up to 20% off selected add-ons" /></label>
    <label className="text-sm sm:col-span-2">Where it shows<select name="placement" className={input} defaultValue={placementOf(banner)}>
      {Object.entries(PLACEMENTS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
    <ImageField name="image_url" label="Image" value={banner?.image_url ?? ""} hint="Hero: wide, about 1600 × 700. Side cards: about 800 × 600. JPEG, PNG or WebP, up to 5 MB." />
    <ImageField name="mobile_image_url" label="Phone image (optional)" value={banner?.mobile_image_url ?? ""} ratio="4 / 5" hint="Shown on phones instead, about 800 × 1000. Leave empty to use the main image." />
    <label className="text-sm">Button link<input name="link_url" maxLength={2000} className={input} defaultValue={banner?.link_url ?? ""} placeholder="/search?offer=1" /></label>
    <label className="text-sm">Button text<input name="link_label" maxLength={100} className={input} defaultValue={banner?.link_label ?? ""} placeholder="Shop offers" /></label>
    <label className="text-sm">Starts (India time, optional)<input name="publish_at" type="datetime-local" className={input} defaultValue={toIndiaInput(banner?.publish_at ?? null)} /></label>
    <label className="text-sm">Ends (India time, optional)<input name="ends_at" type="datetime-local" className={input} defaultValue={toIndiaInput(banner?.ends_at ?? null)} /></label>
    <label className="text-sm">Status<select name="status" className={input} defaultValue={banner?.status ?? "published"}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
    <div className="flex items-end gap-3"><button name="action" value="save" type="submit" className="btn btn-primary">{banner ? "Save banner" : "Add banner"}</button>
      {banner && <ConfirmSubmit name="action" value="delete" formNoValidate className="btn btn-ghost" message={`Delete the banner "${banner.title}"? This cannot be undone.`}>Delete</ConfirmSubmit>}</div>
  </form>;
}
