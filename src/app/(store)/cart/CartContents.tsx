"use client";

import Cover from "@/components/Cover";
import Link from "next/link";
import { ArrowRight, ShoppingBag, Trash2 } from "lucide-react";
import { cartTotals, useCart } from "@/components/CartProvider";
import type { PublicBook } from "@/components/book-data";
import { rupees } from "@/lib/money";
import Price from "@/components/Price";
import PricingSummary from "@/components/PricingSummary";
import { useCoupon, usePricing } from "@/components/usePricing";

export default function CartContents({ books, enabled }: { books: PublicBook[]; enabled: boolean }) {
  const cart = useCart();
  const [coupon, setCoupon] = useCoupon();
  const { pricing } = usePricing(cart.ready ? cart.slugs : [], coupon);
  if (!cart.ready) return <p role="status">Loading your bag...</p>;
  if (!cart.slugs.length) return <div className="empty-state"><ShoppingBag size={30} aria-hidden="true" /><h2>Your next chapter starts here.</h2><p>Your bag is empty.</p><Link href="/search" className="btn btn-primary">Explore the books <ArrowRight size={17} aria-hidden="true" /></Link></div>;
  const selected = cart.slugs.flatMap((slug) => books.filter((book) => book.slug === slug));
  const missing = cart.slugs.filter((slug) => !books.some((book) => book.slug === slug));
  const totals = selected.every((book) => book.saleable) ? cartTotals(selected.map((book) => ({ price_inr: book.price }))) : null;
  const totalLabel = totals ? rupees(totals.total) : "Not yet on sale";
  const unavailable = !totals || missing.length > 0 || selected.some((book) => !book.saleable);
  return <div className="cart-layout">
    <div>{selected.map((book) => <article className="cart-row" key={book.slug}>
      <Link href={`/books/${encodeURIComponent(book.slug)}`} tabIndex={-1} aria-hidden="true"><Cover src={book.cover} title={book.title} sizes="88px" /></Link>
      <div><h2><Link href={`/books/${encodeURIComponent(book.slug)}`}>{book.title}</Link></h2>{book.file_format && <p className="small muted">{book.file_format} digital edition</p>}{book.saleable && book.price > 0 ? <Price book={book} /> : <p className="small muted">Not yet on sale</p>}{!book.saleable && <p className="small muted">{enabled ? "Not available for purchase" : "Saved for later"}</p>}</div>
      <button className="icon-button" type="button" title={`Remove ${book.title}`} aria-label={`Remove ${book.title} from bag`} onClick={() => cart.remove(book.slug)}><Trash2 size={19} aria-hidden="true" /></button>
    </article>)}
      {missing.map((slug) => <div className="cart-row" key={slug}><span /><div><p>This title is no longer available.</p><p className="small muted">{slug}</p></div><button type="button" className="icon-button" title="Remove unavailable title" aria-label={`Remove unavailable title ${slug}`} onClick={() => cart.remove(slug)}><Trash2 size={19} aria-hidden="true" /></button></div>)}
      {cart.error && <p className="small text-danger" role="alert">{cart.error}</p>}
      <Link className="text-link mt-6" href="/search">Continue browsing <ArrowRight size={17} aria-hidden="true" /></Link>
    </div>
    <aside className="order-summary"><h2>Your selection</h2><div className="summary-line"><span>{cart.slugs.length} {cart.slugs.length === 1 ? "edition" : "editions"}</span><span>{totals ? rupees(totals.subtotal) : totalLabel}</span></div>
      {totals && totals.tax > 0 && <div className="summary-line"><span>Tax</span><span>{rupees(totals.tax)}</span></div>}
      <PricingSummary pricing={totals ? pricing : null} coupon={coupon} setCoupon={setCoupon} fallback={totalLabel} subtotal={false} />
      {!enabled && <p className="purchase-paused">Online ordering is currently unavailable. You can keep browsing and save titles in your bag for later.</p>}
      {(missing.length > 0 || (enabled && unavailable)) && <p className="small text-danger">Remove unavailable titles to continue.</p>}
      {enabled && !unavailable ? <Link className="btn btn-primary" href="/checkout">Continue to checkout <ArrowRight size={17} aria-hidden="true" /></Link> : <button className="btn btn-primary" type="button" disabled>Checkout unavailable</button>}
      <p className="small muted">Digital editions for personal use. Prices and availability are confirmed at checkout.</p>
    </aside>
  </div>;
}
