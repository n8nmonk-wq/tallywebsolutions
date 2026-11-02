import Link from "next/link";
import { flag } from "@/lib/env";
import { getBooks } from "@/lib/db";
import { publicBook, visibleBook } from "@/components/book-data";
import CheckoutForm from "./CheckoutForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function Checkout({ searchParams }: { searchParams: Promise<{ book?: string | string[] }> }) {
  const [query, records] = await Promise.all([searchParams, getBooks()]);
  const slug = Array.isArray(query.book) ? query.book[0] : query.book;
  const books = records.filter(visibleBook).map((book) => publicBook(book));
  if (slug && !books.some((book) => book.slug === slug)) return <div className="wrap section empty-state"><h1 className="title title-lg">That add-on is not available.</h1><Link className="btn btn-ghost" href="/search">Browse all add-ons</Link></div>;
  return <div className="wrap section"><div className="page-heading"><h1>Checkout</h1>
    <ol className="checkout-steps" aria-label="Checkout steps"><li aria-current="step">Your details</li><li>Secure payment</li><li>Download</li></ol></div>
    <CheckoutForm books={books} initialSlug={slug} enabled={flag("COMMERCE_ENABLED")} />
  </div>;
}
