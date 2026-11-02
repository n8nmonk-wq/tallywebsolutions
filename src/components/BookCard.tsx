import Link from "next/link";
import type { PublicBook } from "./book-data";
import AddToCart from "./AddToCart";
import Price from "./Price";
import QuickView from "./QuickView";
import WishlistButton from "./WishlistButton";
import Book3D from "./motion/Book3D";
import Morph, { morphName } from "./motion/Morph";

const href = (book: PublicBook) => `/books/${encodeURIComponent(book.slug)}`;

export default function BookCard({ book, enabled, morph = true }: { book: PublicBook; index?: number; enabled: boolean; morph?: boolean }) {
  const cover = <Book3D src={book.cover} title={book.title} sizes="(max-width: 640px) 42vw, 180px" />;
  const off = book.onSale && book.regular > 0 ? Math.round((book.saving / book.regular) * 100) : 0;
  return <article className="book-card surface surface-hover surface-lit" data-book-card>
    <div className="card-plate plate">
      <Link href={href(book)} className="card-cover" aria-label={`View ${book.title}`} tabIndex={-1}>{morph ? <Morph name={morphName(book.slug)}>{cover}</Morph> : cover}</Link>
      {book.comingSoon ? <span className="pill card-flag">Coming soon</span> : book.offers?.[0] ? <span className="pill card-flag offer">{book.offers[0]}</span> : off > 0 && <span className="pill card-flag offer">{off}% off</span>}
      <WishlistButton slug={book.slug} title={book.title} />
      <QuickView book={book} enabled={enabled} />
    </div>
    <div className="card-body">
      <p className="eyebrow card-meta">{[book.file_format, book.language].filter(Boolean).join(" · ") || "Digital edition"}</p>
      <h3 className="card-title"><Link href={href(book)}>{book.title}</Link></h3>
      {book.authorship && <p className="card-author">{book.authorship}</p>}
      <div className="card-foot"><Price book={book} /><AddToCart slug={book.slug} title={book.title} enabled={enabled} saleable={book.saleable} saveable={book.saveable} /></div>
    </div>
  </article>;
}
