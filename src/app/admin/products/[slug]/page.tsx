import { sql, type Book } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import AdminShell from "@/components/AdminShell";
import { ArrowLeft, Archive, PackageCheck, Check, ExternalLink, Eye, EyeOff, Rocket, TicketPercent, Trash2, X } from "lucide-react";
import { PRODUCT_STATUSES, productStatus, releaseChecklist } from "@/lib/admin-catalogue";
import { fileCheck } from "@/lib/admin-sale";
import { currentPrice, rupees } from "@/lib/money";
import { isLive, type Offer } from "@/lib/offers";
import ProductForm from "../ProductForm";
import ProductUpload from "../ProductUpload";
import StatusBadge from "../StatusBadge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit product", robots: { index: false, follow: false } };

type AdminProduct = Book & { submission_id: string | null };

const b0 = (rows: unknown) => (rows as { submission_id: string | null }[])[0];

export default async function EditProduct({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [{ slug }, { saved, error }] = await Promise.all([params, searchParams]);
  if (!(await isAdmin())) redirect("/admin/login");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();

  const [rows, categories, sold, offerRows, reviewed] = await Promise.all([
    sql`select * from books where slug=${slug}`,
    sql`select slug,name from categories where status<>'archived' order by sort,name`,
    sql`select count(*)::int as orders from downloads where book_slug=${slug}`,
    // Offers are optional (set up from the Offers screen); without the table there are none to show.
    (async () => { try { return await sql`select * from offers where status<>'archived' order by created_at desc`; } catch { return []; } })(),
    sql`select count(*)::int as n from publishing_submissions where status='approved'`,
  ]);
  // Releasing a reviewed developer submission replaces this product's file; offered only when one is waiting.
  const canReleaseSubmission = ((reviewed as { n: number }[])[0]?.n ?? 0) > 0 || !!b0(rows)?.submission_id;
  const b = (rows as AdminProduct[])[0];
  if (!b) notFound();
  const orders = (sold as { orders: number }[])[0]?.orders ?? 0;
  const status = productStatus(b);
  const now = new Date();
  // Offers that reach this product directly. Collection and whole-order offers are listed on the Offers screen.
  const offers = (offerRows as Offer[]).filter((o) => o.scope === "all" || (o.scope === "books" && !!o.targets?.includes(b.slug))
    || (o.scope === "category" && !!b.category_slug && !!o.targets?.includes(b.category_slug)));
  const ownSale = currentPrice(b, now);

  const notices = <>
    {saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The storefront now shows these changes.</p>}
    {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert"><strong>Not saved.</strong> {error} None of the changes in that form were applied; fix this and save again.</p>}
  </>;
  const header = <div className="flex flex-wrap gap-2">
    <a className="btn btn-ghost" href="/admin/products"><ArrowLeft size={16} aria-hidden="true" />All products</a>
    <a className="btn btn-ghost" href={`/products/${encodeURIComponent(b.slug)}`} target="_blank" rel="noopener noreferrer">View in store<ExternalLink size={16} aria-hidden="true" /></a>
  </div>;

  if (b.third_party) {
    const VisibilityIcon = b.active ? Archive : Eye;
    return (
      <AdminShell active="books" title={b.title} subtitle={`${PRODUCT_STATUSES[status]} · ${b.active ? "Visible" : "Archived"} · ${b.release_approved ? "Released" : "Awaiting release"}`} actions={header}>
        {notices}
        <section className="rounded-xl border border-line bg-white p-5">
          <p className="text-sm text-ink-soft">{b.publisher || "Developer publication"} · ₹{(b.price_inr / 100).toFixed(2)} · {orders ? `${orders} orders` : "No sales yet"}</p>
          <p className="mt-2 text-sm text-ink-soft">Developer submissions change their file and details through a new reviewed submission. Only visibility can be changed here.</p>
          <form action="/api/admin/products" method="post" className="mt-4 grid gap-3 border-t border-line pt-4">
            <input type="hidden" name="action" value={b.active ? "archive" : "restore"} />
            <input type="hidden" name="slug" value={b.slug} />
            <Field id={`${b.slug}-visibility-reason`} name="reason" label="Visibility change reason" minLength={10} maxLength={2000} required />
            <label className="flex items-start gap-2 text-[15px]">
              <input type="checkbox" name="confirmed" required className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--color-brand)]" />
              {b.active ? "I confirm archiving this publication." : "I confirm restoring this publication's visibility."}
            </label>
            <button className="btn btn-primary justify-self-start" type="submit"><VisibilityIcon size={16} aria-hidden="true" />{b.active ? "Archive" : "Restore"}</button>
          </form>
        </section>
      </AdminShell>
    );
  }

  // "File scan clean" is set by Put on sale itself for products uploaded here, so it is not a separate step.
  const checklist = releaseChecklist(b).filter((i) => i.label !== "File scan clean");
  const file = await fileCheck(process.cwd(), b.file_url, b.file_sha256 ?? null);
  // Everything that still stands between this product and "Put on sale", in the order the admin fixes them.
  const uploadedType = b.facts?._file_type ?? null;
  const blockers = [
    ...(!b.file_url ? ["Upload the product file."] : !file.ok && file.reason ? [file.reason] : []),
    ...(b.file_url && uploadedType && b.file_format && uploadedType !== b.file_format ? [`The attached file is ${uploadedType}, but the product is sold as ${b.file_format}. Upload a ${b.file_format} file or change the file type.`] : []),
    ...(b.price_inr > 0 ? [] : ["Set a regular price in Product details."]),
  ];
  const canRelease = !b.release_approved && blockers.length === 0;
  const attachedFile = b.file_url ? { name: b.facts?._file_name || `${b.file_format ?? "PDF"} file`, detail: [b.file_format ?? "PDF", b.file_size].filter(Boolean).join(" · ") } : null;
  const attachedCover = b.cover ? { name: "Cover image", detail: "Shown on the store", image: b.cover } : null;
  return (
    <AdminShell active="books" title={b.title} subtitle={`${(categories as { slug: string; name: string }[]).find((c) => c.slug === b.category_slug)?.name ?? "No category"} · ${orders ? `${orders} orders` : "No sales yet"}`} actions={header}>
      {notices}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 min-w-0 xl:order-1">
          <ProductForm book={b} categories={categories as { slug: string; name: string }[]} />
          {canReleaseSubmission && <details className="mt-6 rounded-xl border border-line bg-white p-5">
            <summary className="cursor-pointer font-semibold">Release from a reviewed submission</summary>
            <p className="mt-3 text-sm text-ink-soft">This replaces the product&apos;s file and cover with the reviewed developer submission (a PDF) and puts it on sale.</p>
            <form action="/api/admin/products" method="post" className="mt-4 grid gap-3">
              <input type="hidden" name="action" value="release" />
              <input type="hidden" name="slug" value={b.slug} />
              <Field id={`${b.slug}-release-submission`} name="submission_id" label="Reviewed submission ID" defaultValue={b.submission_id ?? ""} maxLength={120} required />
              <Field id={`${b.slug}-release-reason`} name="reason" label="Release reason" minLength={10} maxLength={2000} required />
              <label className="flex items-start gap-2 text-[15px]">
                <input type="checkbox" name="confirmed" required className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--color-brand)]" />
                I confirm release using the reviewed submission.
              </label>
              <button className="btn btn-ghost justify-self-start" type="submit"><PackageCheck size={16} aria-hidden="true" /> Release product</button>
            </form>
          </details>}
          <section className="mt-6 rounded-xl border border-danger/30 bg-white p-5" aria-labelledby="danger-heading">
            <h2 id="danger-heading" className="font-semibold text-danger">Delete product</h2>
            <form action="/api/admin/products" method="post" className="mt-3 grid gap-3">
              <input type="hidden" name="action" value="delete" /><input type="hidden" name="slug" value={b.slug} />
              <p className="text-sm text-ink-soft">Deletion is permanent. Products with orders or wishlists cannot be deleted; remove them from the store instead.</p>
              <label className="flex items-start gap-2 text-[15px]"><input type="checkbox" name="confirmed" required className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--color-brand)]" /> I confirm permanent deletion of this product.</label>
              <button className="btn btn-ghost justify-self-start text-danger" type="submit"><Trash2 size={16} aria-hidden="true" />Delete product</button>
            </form>
          </section>
        </div>

        <aside className="order-1 grid gap-4 xl:sticky xl:top-6 xl:order-2">
          <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="status-heading">
            <div className="flex items-center justify-between gap-3">
              <h2 id="status-heading" className="font-semibold">Status</h2>
              <StatusBadge status={status} />
            </div>
            <div className="mt-4 flex items-center gap-3">
              {b.cover ? <img src={b.cover} alt="" className="h-16 w-16 rounded-2 border border-line object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-2 bg-bg-3 text-[11px] text-ink-soft">No cover</span>}
              <p className="text-sm text-ink-soft">{b.file_format ?? "PDF"}{b.file_size ? ` · ${b.file_size}` : ""}<br />{b.price_inr > 0 ? rupees(b.price_inr) : "No price yet"}</p>
            </div>
            <ul className="mt-4 grid gap-1.5" aria-label="Release checklist">{checklist.map((i) => <li key={i.label} className={`flex items-center gap-2 text-sm ${i.ok ? "text-ink" : "text-ink-soft"}`}>
              {i.ok ? <Check size={14} className="text-brand" aria-hidden="true" /> : <X size={14} aria-hidden="true" />}{i.label}<span className="sr-only">{i.ok ? ": done" : ": missing"}</span></li>)}</ul>
            {!b.release_approved && blockers.length > 0 && <div className="mt-4 rounded-2 border border-danger/30 bg-danger/5 p-3 text-sm" role="note">
              <p className="font-medium text-danger">Before it can go on sale</p>
              <ul className="mt-1 grid list-disc gap-1 pl-5 text-ink">{blockers.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>}
            {!b.release_approved && <form action="/api/admin/products" method="post" className="mt-4">
              <input type="hidden" name="action" value="put-on-sale" /><input type="hidden" name="slug" value={b.slug} />
              <button className="btn btn-primary w-full" type="submit" disabled={!canRelease}>
                <Rocket size={16} aria-hidden="true" /> Put on sale</button>
            </form>}
            <form action="/api/admin/products" method="post" className="mt-2">
              <input type="hidden" name="action" value={b.active ? "hide" : "show"} /><input type="hidden" name="slug" value={b.slug} />
              <button className="btn btn-ghost w-full" type="submit">{b.active ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{b.active ? "Remove from store" : "Restore to store"}</button>
            </form>
          </section>

          <section className="grid gap-3 rounded-xl border border-line bg-white p-5" aria-labelledby="files-heading">
            <h2 id="files-heading" className="font-semibold">Files</h2>
            <ProductUpload slug={b.slug} kind="pdf" attached={attachedFile} onSale={!!b.release_approved} />
            <div className="border-t border-line pt-3"><ProductUpload slug={b.slug} kind="cover" attached={attachedCover} /></div>
          </section>

          <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="offers-heading">
            <div className="flex items-center justify-between gap-3">
              <h2 id="offers-heading" className="font-semibold">Offers</h2>
              <a className="text-sm underline" href="/admin/offers">Manage offers</a>
            </div>
            {offers.length ? <ul className="mt-3 grid gap-2">{offers.map((o) => <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><TicketPercent size={15} className="shrink-0 text-ink-soft" aria-hidden="true" /><span className="truncate">{o.name}</span></span>
              <span className="shrink-0 text-xs text-ink-soft">{isLive(o, now) ? "Live" : o.status === "paused" ? "Paused" : o.status === "draft" ? "Draft" : "Not running"}</span></li>)}</ul>
              : <p className="mt-2 text-sm text-ink-soft">No offer applies to this product. Discounts, coupons and bundles are created on the Offers screen.</p>}
            {b.sale_price_inr != null && <form action="/api/admin/products" method="post" className="mt-4 grid gap-2 border-t border-line pt-3">
              <input type="hidden" name="action" value="pricing" /><input type="hidden" name="slug" value={b.slug} />
              <p className="text-sm text-ink-soft">This product also has its own sale price of {rupees(b.sale_price_inr)}{ownSale.onSale ? " (running now)" : ""}, set before Offers existed. Remove it and use an offer instead.</p>
              <button className="btn btn-ghost" type="submit">Remove product sale price</button>
            </form>}
          </section>

        </aside>
      </div>
    </AdminShell>
  );
}

function Field({
  name, label, defaultValue, hint, id = name + defaultValue?.slice(0, 4), ...rest
}: {
  name: string; label: string; defaultValue?: string; hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} name={name} className="field-input"
        defaultValue={defaultValue} {...rest} />
      {hint && <p className="mt-1.5 text-[13px] text-ink-soft">{hint}</p>}
    </div>
  );
}
