import BookCard from "../BookCard";
import Link from "next/link";
import Carousel from "../Carousel";
import type { PublicBook } from "../book-data";
import type { Home } from "@/lib/home";

// A small shelf is one product grid; a larger shelf becomes rails.
export default function Featured({ books, rails, enabled }: { books: PublicBook[]; rails: Home["rails"]; enabled: boolean }) {
  if (!books.length) return <section className="wrap section"><p className="eyebrow">New titles on the way</p></section>;
  if (books.length < 5) return <section id="catalogue" className="wrap section">
    <div className="section-head reveal"><div><h2>Shop the collection</h2><p>{books.length} {books.length === 1 ? "title" : "titles"} · instant download</p></div>
      <Link className="link-line" href="/search">View all <span aria-hidden="true">→</span></Link></div>
    <ul className="book-grid home-grid">{books.map((b) => <li key={b.slug} className="reveal"><BookCard book={b} enabled={enabled} /></li>)}
      <li className="grid-cta reveal"><p className="eyebrow">New titles every month</p><p className="grid-cta-title">Find your next read</p>
        <div className="grid-cta-links"><Link className="btn btn-primary" href="/search">Browse all books <span aria-hidden="true">→</span></Link>
          <Link className="btn btn-ghost" href="/wishlist">Your wishlist</Link></div></li></ul>
  </section>;
  const seen = new Set<string>();
  const once = (slug: string) => (seen.has(slug) ? false : (seen.add(slug), true));
  // A row needs at least four books; one or two cards in a full-width row reads as broken.
  return <>{rails.filter((r) => r.books.length >= 4).map((r) => <div className="wrap section" key={r.key}><Carousel title={r.title} tagline={r.tagline} href={r.href}>
    {r.books.map((b) => <BookCard key={b.slug} book={b} enabled={enabled} morph={once(b.slug)} />)}</Carousel></div>)}</>;
}
