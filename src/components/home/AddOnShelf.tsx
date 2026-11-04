"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import Cover from "../Cover";
import { rupees } from "@/lib/money";

export type ShelfItem = { slug: string; title: string; cover: string | null; price: number; regular: number; onSale: boolean };

// A shelf of add-on spines. The chosen add-on turns out from its spine into its cover, the way a
// box is pulled from a shelf, and its name and price roll up in the caption below.
export default function AddOnShelf({ items }: { items: ShelfItem[] }) {
  const [active, setActive] = useState(0);
  const count = items.length;
  if (!count) return null;
  const go = (step: number) => setActive((i) => (i + step + count) % count);
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
  };
  const current = items[active];
  return <section className="shelf" aria-roledescription="carousel" aria-label="Add-ons shelf" onKeyDown={onKey}>
    <div className="shelf-row">
      {items.map((item, i) => <button key={item.slug} type="button"
        className={`shelf-item${i === active ? " is-active" : ""}`} aria-label={`Show ${item.title}`}
        aria-pressed={i === active} onClick={() => setActive(i)} style={{ "--shelf-n": i } as CSSProperties}>
        <span className="shelf-spine"><span className="shelf-spine-title">{item.title}</span></span>
        <span className="shelf-cover"><Cover src={item.cover} title={item.title} sizes="220px" /></span>
      </button>)}
    </div>
    <div className="shelf-caption" aria-live="polite">
      <p className="shelf-title">{current.title}</p>
      <p className="shelf-price">{current.onSale ? <><s>{rupees(current.regular)}</s> {rupees(current.price)}</> : rupees(current.price)}</p>
      <Link className="btn btn-primary" href={`/books/${encodeURIComponent(current.slug)}`}>View add-on <span aria-hidden="true">→</span></Link>
    </div>
    <div className="shelf-controls">
      <button type="button" className="round-btn" onClick={() => go(-1)} aria-label="Previous add-on"><ChevronLeft size={17} aria-hidden="true" /></button>
      <span className="shelf-count">{active + 1} / {count}</span>
      <button type="button" className="round-btn" onClick={() => go(1)} aria-label="Next add-on"><ChevronRight size={17} aria-hidden="true" /></button>
    </div>
  </section>;
}
