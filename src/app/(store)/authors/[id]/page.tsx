import Link from "next/link";
import { flag } from "@/lib/env";
import { notFound } from "next/navigation";
import { getBooks } from "@/lib/db";
import { getPublicContent, safeUrl } from "@/lib/content";
import { siteUrl } from "@/lib/store";
import { jsonLdHtml } from "@/lib/catalogue";
import { publicBook, visibleBook } from "@/components/book-data";
import BookCard from "@/components/BookCard";

export const dynamic = "force-dynamic";

// A profile appears once published by admin, or as a plain bibliography for an attributed author.
async function load(id: string) {
  const [records, content] = await Promise.all([getBooks(), getPublicContent()]);
  const books = records.filter((book) => book.author_slug === id && visibleBook(book)).map((book) => publicBook(book));
  const profile = content.authors.find((author) => author.id === id);
  const name = profile?.name || books[0]?.authorship;
  return name ? { profile, books, name } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const author = await load(id);
  if (!author) return { title: "Author not found", robots: { index: false } };
  return { title: author.name, description: author.profile?.bio?.slice(0, 160) || `Add-ons by ${author.name}.`,
    alternates: { canonical: `${siteUrl()}/authors/${encodeURIComponent(id)}` } };
}

export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const author = await load(id);
  if (!author) notFound();
  let photo: string | null = null;
  try { photo = safeUrl(author.profile?.photo_url); } catch { /* An unusable photo is omitted. */ }
  const enabled = flag("COMMERCE_ENABLED");
  const url = `${siteUrl()}/authors/${encodeURIComponent(id)}`;
  const jsonLd = { "@context": "https://schema.org", "@type": "Person", "@id": url, url, name: author.name,
    ...(author.profile?.bio && { description: author.profile.bio }), ...(photo && { image: photo.startsWith("/") ? `${siteUrl()}${photo}` : photo }) };
  return <div className="wrap section">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/search">All add-ons</Link><span aria-hidden="true">/</span><span aria-current="page">{author.name}</span></nav>
    <header className="author-hero">
      {photo && <img src={photo} alt={`Portrait of ${author.name}`} className="author-photo" />}
      <div><p className="eyebrow">Developer</p><h1>{author.name}</h1>
        {author.profile?.bio && <p className="preserve-lines">{author.profile.bio}</p>}
        <p className="small muted">{author.books.length} {author.books.length === 1 ? "add-on" : "add-ons"} in the store</p>
      </div>
    </header>
    {author.books.length > 0 && <section className="section" aria-labelledby="author-books"><h2 id="author-books" className="section-title">Add-ons by {author.name}</h2>
      <div className="book-grid">{author.books.map((book, index) => <BookCard key={book.slug} book={book} index={index} enabled={enabled} />)}</div></section>}
  </div>;
}
