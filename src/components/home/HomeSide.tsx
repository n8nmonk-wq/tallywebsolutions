import Link from "next/link";
import { Library } from "lucide-react";
import Cover from "../Cover";
import Price from "../Price";
import type { PublicBook } from "../book-data";

// Two retail promo cards beside the hero: the deepest saving and the newest title, always real books.
export function sideBooks(books: PublicBook[]) {
  const live = books.filter((b) => !b.comingSoon);
  const deal = [...live].sort((a, b) => b.saving - a.saving || b.price - a.price)[0];
  const fresh = [...live].sort((a, b) => String(b.release_date ?? "").localeCompare(String(a.release_date ?? "")) || (b.year ?? 0) - (a.year ?? 0))
    .find((b) => b.slug !== deal?.slug);
  return { deal, fresh };
}

function Card({ book, kicker, tone }: { book: PublicBook; kicker: string; tone: "gold" | "green" }) {
  return <Link href={`/books/${encodeURIComponent(book.slug)}`} className={`side-card side-${tone}`}>
    <span className="side-text">
      <span className="eyebrow">{kicker}</span>
      <span className="side-title">{book.title}</span>
      <Price book={book} />
      <span className="link-line">Shop now <span aria-hidden="true">→</span></span>
    </span>
    <span className="side-cover"><Cover src={book.cover} title={book.title} sizes="120px" /></span>
  </Link>;
}

export default function HomeSide({ books }: { books: PublicBook[] }) {
  const { deal, fresh } = sideBooks(books);
  if (!deal) return null;
  return <aside className="home-side" aria-label="Deals">
    <Card book={deal} kicker="Deal of the day" tone="gold" />
    {fresh ? <Card book={fresh} kicker="New arrival" tone="green" />
      : <Link href="/library" className="side-card side-green"><span className="side-text"><span className="eyebrow">Your library</span>
        <span className="side-title">Every book you buy, ready to re-download</span><span className="link-line">Open library <span aria-hidden="true">→</span></span></span>
        <span className="side-icon" aria-hidden="true"><Library size={44} strokeWidth={1.4} /></span></Link>}
  </aside>;
}
