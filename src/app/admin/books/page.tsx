import { sql, type Book } from "@/lib/db";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import AdminShell from "@/components/AdminShell";
import { Archive, BookCheck, Check, Eye, Rocket, X } from "lucide-react";
import { releaseChecklist } from "@/lib/admin-catalogue";
import { fileCheck } from "@/lib/admin-sale";
import BookForm from "./BookForm";
import BookUpload from "./BookUpload";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add-ons", robots: { index: false, follow: false } };

type AdminBook = Book & { submission_id: string | null };

export default async function AdminBooks({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; q?: string }>;
}) {
  const { saved, error, q = "" } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");

  const needle = q.trim().toLowerCase().slice(0, 100);
  // All four reads in one round trip.
  const [rows, categories, authors, sold] = await Promise.all([
    sql`select * from books order by sort, title`,
    sql`select slug,name from categories where status<>'archived' order by sort,name`,
    sql`select id,name from author_profiles order by name`,
    sql`select book_slug, count(*)::int as orders, sum(count)::int as downloads from downloads group by book_slug`,
  ]);
  const books = (rows as AdminBook[]).filter((b) => !needle || [b.title, b.slug, b.authorship ?? ""].some((v) => v.toLowerCase().includes(needle)));
  const categoryList = categories as { slug: string; name: string }[];
  const authorList = authors as { id: string; name: string }[];
  const categoryName = new Map(categoryList.map((c) => [c.slug, c.name]));
  const stats = new Map((sold as { book_slug: string; orders: number; downloads: number }[]).map((s) => [s.book_slug, s]));
  const files = new Map(await Promise.all(books.filter((b) => !b.third_party).map(async (b) => [b.slug, await fileCheck(process.cwd(), b.file_url, b.file_sha256 ?? null)] as const)));

  return (
    <AdminShell active="books" title="Add-ons" subtitle="Price, offers and what is on sale.">
      {saved && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">Saved. The storefront is updated.</p>}
      {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert">{error}</p>}

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <form method="get" className="flex gap-2" role="search">
          <label className="sr-only" htmlFor="admin-book-search">Search add-ons</label>
          <input id="admin-book-search" name="q" defaultValue={q} placeholder="Search name, slug or developer" className="field-input w-64" />
          <button className="btn btn-ghost" type="submit">Search</button>
        </form>
        <details className="ml-auto">
          <summary className="btn btn-ghost cursor-pointer list-none">New add-on</summary>
          <form action="/api/admin/book" method="post" className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-4">
            <input type="hidden" name="action" value="create" />
            <label className="text-sm">Title<input name="title" required maxLength={200} className="field-input mt-1" /></label>
            <label className="text-sm">Slug<input name="slug" required maxLength={101} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="field-input mt-1" /></label>
            <button className="btn btn-primary" type="submit">Create draft</button>
          </form>
        </details>
      </div>

      <div className="grid gap-3">
        {books.map((b) => {
          const s = stats.get(b.slug);
          if (b.third_party) {
            const VisibilityIcon = b.active ? Archive : Eye;
            return (
              <section key={b.slug} className="rounded-xl border border-line bg-bg-2 p-5">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold">{b.title}</h2>
                  <span className="text-sm text-ink-soft">{b.active ? "Visible" : "Archived"} · {b.release_approved ? "Released" : "Awaiting release"} · author submission</span>
                </div>
                <p className="text-sm text-ink-soft">{b.publisher || "Author publication"} · ₹{(b.price_inr / 100).toFixed(2)} · {s ? `${s.orders} orders` : "No sales yet"}</p>
                <form action="/api/admin/book" method="post" className="mt-4 grid gap-3 border-t border-line pt-4">
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
            );
          }
          const checklist = releaseChecklist(b);
          const onSale = checklist.every((i) => i.ok);
          const file = files.get(b.slug) ?? { ok: false, reason: "No file attached yet." };
          const canRelease = !b.release_approved && file.ok && b.price_inr > 0;
          return (
            <article key={b.slug} className="rounded-xl border border-line bg-white p-4">
              <div className="grid items-start gap-4 sm:grid-cols-[64px_minmax(0,1fr)] lg:grid-cols-[64px_minmax(0,1fr)_minmax(260px,auto)]">
                {b.cover ? <img src={b.cover} alt="" className="w-16 rounded-sm shadow" /> : <span className="grid h-24 w-16 place-items-center rounded-sm bg-bg-3 text-[10px] text-ink-soft">No cover</span>}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{b.title}</h2>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${onSale ? "bg-brand/10 text-brand" : "bg-gold/10 text-gold"}`}>{onSale ? `On sale · ₹${(b.price_inr / 100).toFixed(2)}` : "Not on sale"}</span>
                  </div>
                  <p className="text-sm text-ink-soft">{categoryName.get(b.category_slug ?? "") ?? "No category"} · {s ? `${s.orders} orders` : "No sales yet"}</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">{checklist.map((i) => <li key={i.label} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${i.ok ? "border-brand/30 text-brand" : "border-line text-ink-soft"}`}>
                    {i.ok ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}{i.label}</li>)}</ul>
                  {!b.release_approved && file.reason && <p className="mt-2 text-sm text-gold">{file.reason}</p>}
                </div>
                <div className="grid gap-2 sm:col-span-2 lg:col-span-1">
                  <form action="/api/admin/book" method="post" className="flex items-end gap-2">
                    <input type="hidden" name="action" value="price" /><input type="hidden" name="slug" value={b.slug} />
                    <label className="text-sm">Price (₹)<input name="price" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue={(b.price_inr / 100).toFixed(2)} className="field-input mt-1 w-32" /></label>
                    <button className="btn btn-ghost" type="submit">Save price</button>
                  </form>
                  <div className="grid grid-cols-2 gap-2"><BookUpload slug={b.slug} kind="pdf" /><BookUpload slug={b.slug} kind="cover" /></div>
                  {!b.release_approved && <form action="/api/admin/book" method="post">
                    <input type="hidden" name="action" value="put-on-sale" /><input type="hidden" name="slug" value={b.slug} />
                    <button className="btn btn-primary w-full" type="submit" disabled={!canRelease} title={canRelease ? undefined : file.reason ?? "Set a price first."}>
                      <Rocket size={16} aria-hidden="true" /> Put on sale</button>
                  </form>}
                </div>
              </div>
              <details className="mt-4 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-medium">Offer and details</summary>
                <div className="pt-4"><BookForm book={b} categories={categoryList} authors={authorList} /></div>
                <details className="mt-4 border-t border-line pt-3">
                  <summary className="cursor-pointer text-sm text-ink-soft">Release from a reviewed submission</summary>
                  <form action="/api/admin/book" method="post" className="mt-3 grid gap-3">
                    <input type="hidden" name="action" value="release" />
                    <input type="hidden" name="slug" value={b.slug} />
                    <Field id={`${b.slug}-release-submission`} name="submission_id" label="Reviewed submission ID" defaultValue={b.submission_id ?? ""} maxLength={120} required />
                    <Field id={`${b.slug}-release-reason`} name="reason" label="Release reason" minLength={10} maxLength={2000} required />
                    <label className="flex items-start gap-2 text-[15px]">
                      <input type="checkbox" name="confirmed" required className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--color-brand)]" />
                      I confirm release using the reviewed submission.
                    </label>
                    <button className="btn btn-ghost justify-self-start" type="submit"><BookCheck size={16} aria-hidden="true" /> Release add-on</button>
                  </form>
                </details>
              </details>
            </article>
          );
        })}
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
