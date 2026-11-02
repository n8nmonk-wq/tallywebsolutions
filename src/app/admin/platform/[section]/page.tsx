import { notFound, redirect } from "next/navigation";
import { Save, Trash2, Plus, Eye } from "lucide-react";
import Link from "next/link";
import { isAdmin } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { contentSections, getAdminContent, type ContentSection } from "@/lib/content";
import ActionForm from "@/components/ActionForm";
import ModuleFields from "../ModuleFields";
import BookPicker from "../BookPicker";

export default async function ContentPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ type?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { section } = await params;
  if (!contentSections.includes(section as ContentSection)) notFound();
  const selected = section as ContentSection;
  const { type } = await searchParams;
  const records = (await getAdminContent(selected)).filter(record => !(selected === "modules" && type) || record.type === type);
  const books = selected === "collections" ? await sql`select slug,title from books order by title` as { slug: string; title: string }[] : [];
  const collections = selected === "modules" ? await sql`select slug,title from content_collections order by title` as { slug: string; title: string }[] : [];
  const authors = selected === "modules" ? await sql`select id,name from author_profiles order by name` as { id: string; name: string }[] : [];
  const categories = selected === "modules" ? await sql`select slug,name from categories order by sort,name` as { slug: string; name: string }[] : [];
  const options = { books, collections, authors, categories };
  return <section>
    <details className="mb-8 border-y border-line py-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Plus size={16} aria-hidden />New {section === "collections" ? "collection" : section === "authors" ? "author" : section === "testimonials" ? "testimonial" : section === "media" ? "media item" : "module"}</summary><div className="pt-5"><Editor section={selected} record={selected === "modules" && type ? { type } : {}} {...options} /></div></details>
    {!records.length && <p className="text-sm text-ink-soft">No {section} yet.</p>}
    {records.map(record => <section key={String(record.id ?? record.slug)} className="mb-8 border-b border-line pb-8"><h2 className="mb-4 break-words text-lg font-medium">{String(record.title)}</h2><Editor section={selected} record={record} {...options} /></section>)}
  </section>;
}
function Editor({ section, record = {}, books, collections, authors, categories }: { section: ContentSection; record?: Record<string, unknown>; books: { slug: string; title: string }[]; collections: { slug: string; title: string }[]; authors: { id: string; name: string }[]; categories: { slug: string; name: string }[] }) {
  const id = String(record.id ?? record.slug ?? "");
  const field = (name: string, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="text-sm">{label}<input name={name} className="field-input mt-1" defaultValue={String(record[name] ?? "")} {...extra} /></label>;
  const isModule = !["collections", "authors"].includes(section);
  return <ActionForm key={`${id}:${String(record.updated_at ?? "new")}`} action="/api/admin/platform/content">
    <input type="hidden" name="section" value={section} /><input type="hidden" name="id" value={id} /><input type="hidden" name="updated_at" value={record.updated_at instanceof Date ? record.updated_at.toISOString() : String(record.updated_at ?? "")} />
    <div className="grid gap-4 sm:grid-cols-2">
      {field("title", section === "authors" ? "Name" : "Title", { required: true, maxLength: 200 })}
      {section === "collections" && field("slug", "Slug", { required: true, maxLength: 120, pattern: "[a-z0-9]+(-[a-z0-9]+)*", readOnly: Boolean(id) })}
      {isModule && <ModuleFields key={String(record.updated_at ?? "new")} section={section} type={String(record.type ?? (section === "testimonials" ? "testimonial" : section === "media" ? "media" : "text"))} payload={(record.payload ?? {}) as Record<string, unknown>} collections={collections} authors={authors} categories={categories} />}
      {field("image_url", section === "authors" ? "Photo URL" : "Image URL", { maxLength: 2000 })}
      {isModule && field("mobile_image_url", "Mobile image URL", { maxLength: 2000 })}
      {isModule && field("link_url", "Link URL", { maxLength: 2000 })}
      {isModule && field("link_label", "Link label", { maxLength: 100 })}
    </div>
    <label className="text-sm">{section === "authors" ? "Biography" : section === "testimonials" ? "Quote" : "Copy"}<textarea name="body" className="field-input mt-1" rows={4} maxLength={20000} defaultValue={String(record.body ?? (record.payload as Record<string, unknown> | undefined)?.quote ?? "")} /></label>
    {section === "collections" && <BookPicker books={books} selected={Array.isArray(record.book_slugs) ? record.book_slugs as string[] : []} />}
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="text-sm">Status<select name="status" className="field-input mt-1" defaultValue={String(record.status ?? "draft")}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
      {field("publish_at", "Publish at (with timezone)", { placeholder: "2026-10-10T12:00:00+05:30", maxLength: 40 })}
      {isModule && field("ends_at", "Ends at (with timezone)", { placeholder: "2026-10-20T00:00:00+05:30", maxLength: 40 })}
      {section !== "authors" && field("sort", "Sort order", { type: "number", min: -100000, max: 100000, step: 1 })}
    </div>
    <div className="flex flex-wrap gap-3"><button name="action" value="save" type="submit" className="btn btn-primary"><Save size={16} aria-hidden />Save</button>{id && <><Link href={`/admin/platform/preview?section=${section}&id=${encodeURIComponent(id)}`} className="btn btn-ghost" target="_blank" rel="noopener noreferrer"><Eye size={16} aria-hidden />Preview saved</Link><button name="action" value="delete" type="submit" formNoValidate className="btn btn-ghost"><Trash2 size={16} aria-hidden />Delete</button></>}</div>
  </ActionForm>;
}
