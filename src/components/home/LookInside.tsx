import Link from "next/link";
import Carousel from "../Carousel";
import Cover from "../Cover";
import type { PublicBook } from "../book-data";

const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export default function LookInside({ books }: { books: PublicBook[] }) {
  const items = books.filter((b) => b.highlights.length).slice(0, 8);
  if (!items.length) return null;
  const cards = items.map((b) => <Link key={b.slug} href={`/books/${encodeURIComponent(b.slug)}`} className="look-card">
    <span className="look-cover"><Cover src={b.cover} title={b.title} sizes="140px" /></span>
    <span className="look-text"><span className="look-title">{b.title}</span><ul>{b.highlights.slice(0, 4).map((h, i) => <li key={i}>{clip(h)}</li>)}</ul>
      <span className="link-line">Look inside <span aria-hidden="true">→</span></span></span>
  </Link>);
  // Two or fewer titles fill the band as a grid; a carousel would leave most of it empty.
  return <section className="wrap section"><div className="look-band">{items.length > 2
    ? <Carousel title="Look inside" tagline="A glimpse before you buy">{cards}</Carousel>
    : <><div className="section-head reveal"><div><h2>Look inside</h2><p>A glimpse before you buy</p></div></div>
      <div className={`look-grid look-${items.length}`}>{cards}</div></>}</div></section>;
}
