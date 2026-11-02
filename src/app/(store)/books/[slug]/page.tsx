import Link from "next/link";
import { flag } from "@/lib/env";
import { notFound } from "next/navigation";
import { BadgeCheck, BookOpen, Download, FileText, Globe2, Hash, Infinity as Lifetime, Layers, Lock, Building2 } from "lucide-react";
import { getBook, getBooks } from "@/lib/db";
import { getPublicContent, safeUrl } from "@/lib/content";
import { bookJsonLd, jsonLdHtml } from "@/lib/catalogue";
import { siteUrl } from "@/lib/store";
import { getCategories } from "@/lib/store-data";
import { publicBook, visibleBook } from "@/components/book-data";
import AddToCart from "@/components/AddToCart";
import BookCard from "@/components/BookCard";
import Carousel from "@/components/Carousel";
import Book3D from "@/components/motion/Book3D";
import Morph, { morphName } from "@/components/motion/Morph";
import SampleViewer from "@/components/product/SampleViewer";
import Price from "@/components/Price";
import BookTabs from "@/components/product/BookTabs";
import ShareButton from "@/components/product/ShareButton";
import WishlistButton from "@/components/WishlistButton";
import BuyNow from "@/components/BuyNow";
import RecentlyViewed from "@/components/RecentlyViewed";
import { cartLines, loadOffers } from "@/lib/offer-data";
import { offerBadges } from "@/lib/offers";
import { TicketPercent } from "lucide-react";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const book = await getBook((await params).slug);
  if (!book || !visibleBook(book)) return { title: "Book not found", robots: { index: false } };
  return { title: book.title, description: book.description || undefined,
    alternates: { canonical: `${siteUrl()}/books/${encodeURIComponent(book.slug)}` },
    openGraph: { title: book.title, description: book.description || undefined, images: book.cover && !book.cover.startsWith("data:") ? [book.cover] : [] } };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const now = new Date();
  const [book, records, content, categories] = await Promise.all([getBook((await params).slug), getBooks(), getPublicContent(), getCategories()]);
  if (!book || !visibleBook(book)) notFound();
  const live = await loadOffers();
  const view = { ...publicBook(book, now), offers: live.length ? offerBadges((await cartLines([book], now))[0], live, now) : [] };
  const enabled = flag("COMMERCE_ENABLED");
  const url = `${siteUrl()}/books/${encodeURIComponent(book.slug)}`;
  const category = categories.find((c) => c.slug === book.category_slug);
  const author = book.author_slug ? content.authors.find((a) => a.id === book.author_slug) : undefined;
  let sample: string | null = null;
  try { sample = safeUrl(book.sample_url); } catch { /* A malformed sample is not offered. */ }
  const others = records.filter((r) => r.slug !== book.slug && visibleBook(r)).map((r) => publicBook(r, now));
  const byAuthor = book.author_slug ? others.filter((o) => o.author_slug === book.author_slug).slice(0, 12) : [];
  const similar = others.filter((o) => o.category_slug && o.category_slug === book.category_slug && !byAuthor.includes(o)).slice(0, 12);
  const details: [typeof BookOpen, string, string | number | null | undefined][] = [
    [FileText, "Format", book.file_format], [Layers, "Pages", book.pages], [Globe2, "Language", view.language], [Hash, "ISBN", book.isbn],
    [Building2, "Publisher", book.publisher], [BookOpen, "Edition", view.edition], [BadgeCheck, "Published", view.release_date ?? book.year],
  ];
  const facts = Object.entries(book.facts || {}).filter(([k]) => !k.startsWith("_"));
  const paragraphs = (book.long_description || "").split(/\n\s*\n/).filter(Boolean);
  const tabs = [
    (paragraphs.length || book.description) && { id: "about", label: "About the book", content: <div className="prose">{(paragraphs.length ? paragraphs : [book.description!]).map((p, i) => <p key={i}>{p}</p>)}</div> },
    view.highlights.length && { id: "contents", label: "Contents", content: <ul className="contents-list">{view.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul> },
    facts.length && { id: "details", label: "More details", content: <table className="catalogue"><tbody>{facts.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table> },
    author && { id: "author", label: "About the author", content: <div className="prose"><p><strong>{author.name}</strong></p>{author.bio && <p>{author.bio}</p>}<p><Link className="text-link" href={`/authors/${encodeURIComponent(author.id)}`}>All books by {author.name}</Link></p></div> },
  ].filter(Boolean) as { id: string; label: string; content: React.ReactNode }[];
  return <div className="product-page" data-book-page>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(bookJsonLd(book, url, view.saleable, now)) }} />
    <div className="wrap">
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span>{category && <><Link href={`/category/${category.slug}`}>{category.name}</Link><span aria-hidden="true">/</span></>}<span aria-current="page">{book.title}</span></nav>
      <article className="product-main">
        <div className="product-gallery">
          <div className="gallery-stage plate surface-lit"><Morph name={morphName(book.slug)}><Book3D src={book.cover} title={book.title} sizes="(max-width: 900px) 70vw, 320px" priority /></Morph></div>
          {sample && <SampleViewer href={sample} title={book.title} />}
        </div>
        <div className="product-info enter">
          <div className="title-row"><h1>{book.title}</h1><div className="title-actions"><WishlistButton slug={book.slug} title={book.title} variant="page" /><ShareButton title={book.title} url={url} /></div></div>
          {book.subtitle && <p className="product-subtitle">{book.subtitle}</p>}
          {book.authorship && <p className="product-author">by {book.author_slug ? <Link href={`/authors/${encodeURIComponent(book.author_slug)}`}>{book.authorship}</Link> : book.authorship}</p>}
          <ul className="tag-row">{category && <li><Link className="chip" href={`/category/${category.slug}`}>{category.name}</Link></li>}
            {view.language && <li><Link className="chip" href={`/search?language=${encodeURIComponent(view.language)}`}>{view.language}</Link></li>}
            {book.file_format && <li><span className="chip">{book.file_format}</span></li>}
            {book.pages && <li><span className="chip">{book.pages} pages</span></li>}</ul>
          <div className="buy-panel surface surface-lit">
            <Price book={view} size="page" />
            {view.offers.length > 0 && <ul className="offer-chips" aria-label="Offers">{view.offers.map((o) => <li key={o}><TicketPercent size={15} aria-hidden="true" />{o}</li>)}</ul>}
            <div className="buy-row"><BuyNow slug={book.slug} title={book.title} enabled={enabled} saleable={view.saleable} />
              <AddToCart slug={book.slug} title={book.title} enabled={enabled} saleable={view.saleable} saveable={view.saveable} variant="page" /></div>
            {!enabled && <p className="notice">Ordering opens soon. Save it to your bag.</p>}
            <ul className="ticks">{[[Download, "Instant download"], [Lock, "Secure payment"], [BadgeCheck, "Licensed to you"], [Lifetime, "Lifetime library"]].map(([Icon, label]) =>
              <li key={label as string}><Icon size={16} aria-hidden="true" /><span>{label as string}</span></li>)}</ul>
          </div>
          <dl className="detail-strip">{details.filter(([, , v]) => v).map(([Icon, label, value]) => <div key={label}><dt><Icon size={14} aria-hidden="true" />{label}</dt><dd>{value}</dd></div>)}</dl>
        </div>
      </article>
      <BookTabs tabs={tabs} />
      {byAuthor.length > 0 && <div className="section"><Carousel title={`More by ${book.authorship}`}>{byAuthor.map((b) => <BookCard key={b.slug} book={b} enabled={enabled} />)}</Carousel></div>}
      {similar.length > 0 && <div className="section"><Carousel title="Similar books" href={category ? `/category/${category.slug}` : "/search"}>{similar.map((b) => <BookCard key={b.slug} book={b} enabled={enabled} />)}</Carousel></div>}
      <RecentlyViewed current={book.slug} />
    </div>
  </div>;
}
