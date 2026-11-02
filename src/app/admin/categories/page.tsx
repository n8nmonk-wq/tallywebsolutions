import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import AdminShell from "@/components/AdminShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Categories", robots: { index: false, follow: false } };
type Row = { slug: string; name: string; parent_slug: string | null; image_url: string | null; colour: string | null; sort: number; status: string; books: number };

export default async function Categories({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { saved } = await searchParams;
  const rows = await sql`select c.*, (select count(*)::int from books b where b.category_slug=c.slug) books
    from categories c order by c.sort, c.name` as Row[];
  const form = (c?: Row) => <form action="/api/admin/categories" method="post" className="grid gap-3 sm:grid-cols-4">
    <label className="text-sm">Name<input name="name" required maxLength={80} className="field-input mt-1" defaultValue={c?.name} /></label>
    <label className="text-sm">Slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" readOnly={!!c} className="field-input mt-1" defaultValue={c?.slug} /></label>
    <label className="text-sm">Parent<select name="parent_slug" className="field-input mt-1" defaultValue={c?.parent_slug ?? ""}><option value="">None</option>
      {rows.filter((r) => r.slug !== c?.slug).map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}</select></label>
    <label className="text-sm">Colour<input name="colour" type="color" className="field-input mt-1 h-[46px]" defaultValue={c?.colour ?? "#FFD93D"} /></label>
    <label className="text-sm sm:col-span-2">Image URL<input name="image_url" maxLength={2000} className="field-input mt-1" defaultValue={c?.image_url ?? ""} /></label>
    <label className="text-sm">Order<input name="sort" type="number" className="field-input mt-1" defaultValue={c?.sort ?? 0} /></label>
    <label className="text-sm">Status<select name="status" className="field-input mt-1" defaultValue={c?.status ?? "published"}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
    <button className="btn btn-primary sm:col-span-4 justify-self-start" type="submit">{c ? "Save category" : "Add category"}</button>
  </form>;
  return <AdminShell active="categories" title="Categories" subtitle="Categories drive the header, category pages, homepage tiles and filters.">
    {saved && <p role="status" className="mb-6 text-sm">Saved.</p>}
    <section className="mb-10 rounded-lg border border-line bg-white p-5"><h2 className="mb-4 font-semibold">New category</h2>{form()}</section>
    {rows.map((c) => <details key={c.slug} className="mb-3 rounded-lg border border-line bg-white p-4">
      <summary className="flex cursor-pointer items-center gap-3"><span className="inline-block h-4 w-4 rounded" style={{ background: c.colour ?? "#ddd" }} />
        <span className="font-medium">{c.name}</span><span className="text-sm text-ink-soft">{c.books} books · {c.status}</span></summary>
      <div className="pt-4">{form(c)}</div></details>)}
  </AdminShell>;
}
