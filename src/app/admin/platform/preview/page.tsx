import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { contentSections, getAdminContent, safeUrl, type ContentSection } from "@/lib/content";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
function url(value: unknown) { try { return safeUrl(value); } catch { return null; } }
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ section?: string; id?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { section, id } = await searchParams;
  if (!id || !contentSections.includes(section as ContentSection)) notFound();
  const record = (await getAdminContent(section as ContentSection)).find(r => String(r.id ?? r.slug) === id);
  if (!record) notFound();
  const payload = (record.payload ?? {}) as Record<string, unknown>;
  let content = record;
  if (record.type === "collection") {
    const collection = (await getAdminContent("collections")).find(c => c.slug === payload.collection_slug);
    if (collection) content = collection;
  }
  if (record.type === "author") {
    const author = (await getAdminContent("authors")).find(a => a.id === payload.author_id);
    if (author) content = author;
  }
  const image = url(content.image_url);
  const mobileImage = url(record.mobile_image_url);
  const video = url(payload.video_url);
  const href = url(record.link_url);
  const slugs = Array.isArray(content.book_slugs) ? content.book_slugs : [];
  const books = slugs.length ? await sql`select slug,title,description,cover from books where slug in (select jsonb_array_elements_text(${JSON.stringify(slugs)}::jsonb))` : [];
  return <section>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4"><p className="text-sm">Saved preview · {String(record.status)}{record.publish_at ? ` · ${String(record.publish_at)}` : ""}</p><Link className="text-sm underline" href={`/admin/platform/${section}`}>Back to editor</Link></div>
    <article className="max-w-4xl">
      <h1 className="mb-4 break-words text-3xl font-medium">{String(content.title)}</h1>
      {typeof payload.subtitle === "string" && <p className="mb-5 break-words text-lg">{payload.subtitle}</p>}
      {video ? <video controls preload="metadata" src={video} poster={image ?? undefined} className="mb-6 w-full max-w-3xl" aria-label={String(content.title)} /> : image && <picture>{mobileImage && <source media="(max-width: 640px)" srcSet={mobileImage} />}<img src={image} alt={String(content.title)} className="mb-6 max-h-[520px] max-w-full object-contain" /></picture>}
      {record.type === "testimonial" ? <figure><blockquote className="whitespace-pre-wrap break-words text-xl">{String(payload.quote ?? content.body ?? "")}</blockquote><figcaption className="mt-3 text-sm">{String(payload.attribution ?? "")}</figcaption></figure> : typeof content.body === "string" && <p className="whitespace-pre-wrap break-words leading-relaxed">{content.body}</p>}
      {books.length > 0 && <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{slugs.flatMap(slug => books.filter(b => b.slug === slug)).map(book => <div key={book.slug}>{url(book.cover) && <img src={url(book.cover)!} alt={book.title} className="mb-3 h-48 max-w-full object-contain" />}<h2 className="break-words text-lg font-medium">{book.title}</h2>{book.description && <p className="mt-2 break-words text-sm">{book.description}</p>}</div>)}</div>}
      {href && <Link href={href} className="btn btn-primary mt-6">{String(record.link_label || "Read more")}</Link>}
    </article>
  </section>;
}
