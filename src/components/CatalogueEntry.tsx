import Link from "next/link";
import type { PublicBook } from "./book-data";
import AddToCart from "./AddToCart";
import BuyNow from "./BuyNow";
import Price from "./Price";
import Book3D from "./motion/Book3D";
import Morph, { morphName } from "./motion/Morph";
import { isStoreOwned } from "@/lib/store";

// The few-titles layout: the 65f7044 catalogue card, trimmed to what a reader decides on.
export default function CatalogueEntry({ book, index, enabled, morph = true }: { book: PublicBook; index: number; enabled: boolean; morph?: boolean }) {
  const href = `/books/${encodeURIComponent(book.slug)}`;
  const cover = <Book3D src={book.cover} title={book.title} sizes="(max-width: 760px) 60vw, 220px" priority={index === 1} />;
  const chips = [book.file_format, book.pages ? `${book.pages} pages` : null, book.language, book.edition].filter(Boolean) as string[];
  return <article className="entry surface surface-lit reveal" data-book-card>
    <Link href={href} className="entry-plate plate" tabIndex={-1} aria-label={`View ${book.title}`}>{morph ? <Morph name={morphName(book.slug)}>{cover}</Morph> : cover}</Link>
    <div className="entry-info">
      <p className="eyebrow">Catalogue no. {String(index).padStart(3, "0")}</p>
      <h3><Link href={href}>{book.title}</Link></h3>
      {book.authorship && !isStoreOwned(book.authorship) && <p className="card-author">{book.authorship}</p>}
      {chips.length > 0 && <ul className="entry-chips">{chips.map((c) => <li key={c} className="chip">{c}</li>)}</ul>}
      <Link className="link-line" href={href}>View details <span aria-hidden="true">→</span></Link>
      <div className="entry-buy"><Price book={book} size="page" />
        <AddToCart slug={book.slug} title={book.title} enabled={enabled} saleable={book.saleable} saveable={book.saveable} variant="page" />
        <BuyNow slug={book.slug} title={book.title} enabled={enabled} saleable={book.saleable} /></div>
    </div>
  </article>;
}
