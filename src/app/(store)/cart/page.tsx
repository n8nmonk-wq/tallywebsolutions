import { getBooks } from "@/lib/db";
import { flag } from "@/lib/env";
import { publicBook, visibleBook } from "@/components/book-data";
import CartContents from "./CartContents";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your bag", robots: { index: false, follow: false } };

export default async function CartPage() {
  const books = (await getBooks()).filter(visibleBook).map((book) => publicBook(book));
  return <div className="wrap section"><div className="page-heading"><p className="eyebrow">Your next reads</p><h1>Your bag</h1></div>
    <CartContents books={books} enabled={flag("COMMERCE_ENABLED")} />
  </div>;
}
