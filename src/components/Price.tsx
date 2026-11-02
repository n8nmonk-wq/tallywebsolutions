import { rupees } from "@/lib/money";
import type { PublicBook } from "./book-data";

export default function Price({ book, size = "card" }: { book: Pick<PublicBook, "price" | "regular" | "onSale" | "saving" | "saleable" | "comingSoon">; size?: "card" | "page" }) {
  if (!book.saleable || book.price <= 0) return book.comingSoon ? <p className={`price-block price-${size}`}><span className="soon-chip">Coming soon</span></p> : null;
  return <p className={`price-block price-${size}`}>
    {book.onSale && <s className="price-regular" aria-label={`Regular price ${rupees(book.regular)}`}>{rupees(book.regular)}</s>}
    <strong className="price-now">{rupees(book.price)}</strong>
    {book.onSale && <span className="pill-offer">{rupees(book.saving)} off</span>}
  </p>;
}
