import type { Book } from "@/lib/db";
import { isSaleable } from "@/lib/catalogue";
import { currentPrice } from "@/lib/money";

export type ReadingBook = Book;

export function visibleBook(book: Book) {
  return book.active && (!book.third_party || isSaleable(book));
}

export type PublicBook = Pick<ReadingBook,
  "slug" | "title" | "subtitle" | "description" | "authorship" | "cover" |
  "price_inr" | "file_format" | "pages" | "year" | "subject" | "language" | "edition" | "author_slug" | "isbn"
> & { highlights: string[]; saleable: boolean; saveable: boolean; category_slug: string | null; release_date: string | null;
  price: number; regular: number; onSale: boolean; saving: number; comingSoon: boolean;
  /** Badges of live offers on this book, filled by the store loaders; [] when none. */
  offers: string[] };

const day = (value: unknown) => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

// Only public bibliographic and price fields cross the client boundary, never file URLs.
export function publicBook(book: ReadingBook, now: Date = new Date()): PublicBook {
  const { slug, title, subtitle, description, authorship, cover, price_inr,
    file_format, pages, year, subject, language, edition, author_slug, isbn } = book;
  const release = day(book.release_date);
  return { slug, title, subtitle, description, authorship, cover, price_inr,
    file_format, pages, year, subject: subject || book.facts?.Subject || null,
    language: language || book.facts?.Language || null, edition: edition || book.facts?.Edition || null, author_slug, isbn,
    highlights: Array.isArray(book.highlights) ? book.highlights : [],
    saleable: isSaleable(book), saveable: visibleBook(book),
    category_slug: book.category_slug ?? null, release_date: release,
    ...currentPrice(book, now), comingSoon: !!release && release > now.toISOString().slice(0, 10), offers: [] };
}
