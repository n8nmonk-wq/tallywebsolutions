"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import Cover from "../Cover";
import { rupees } from "@/lib/money";

export type ShelfItem = { slug: string; title: string; cover: string | null; price: number; regular: number; onSale: boolean; saleable: boolean };

// Signed distance from the active item, going the short way round, so the shelf looks full at both ends.
export function circularOffset(index: number, active: number, count: number) {
  const d = index - active;
  if (d > count / 2) return d - count;
  if (d < -count / 2) return d + count;
  return d;
}

// Spines in four tones, so a row of add-ons reads as a shelf of boxes rather than one colour.
const TONES = ["navy", "oxblood", "forest", "cream"] as const;

// A shelf of add-on spines. Spines stand at fixed spacing; the chosen add-on turns out of its
// spine into its cover, leaning towards the viewer, and its name rolls up through a mask.
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
    <div className="shelf-stage">
      {items.map((item, i) => <button key={item.slug} type="button"
        className={`shelf-item tone-${TONES[i % TONES.length]}${i === active ? " is-active" : ""}${Math.abs(circularOffset(i, active, count)) >= 5 ? " is-far" : ""}`}
        aria-label={`Show ${item.title}`} aria-pressed={i === active} onClick={() => setActive(i)}
        style={{ "--d": circularOffset(i, active, count) } as CSSProperties}>
        <span className="shelf-spine">
          {item.cover && <span className="shelf-spine-art"><Cover src={item.cover} title={item.title} sizes="80px" /></span>}
          <span className="shelf-spine-label"><span className="shelf-spine-title">{item.title}</span></span>
        </span>
        <span className="shelf-cover"><Cover src={item.cover} title={item.title} sizes="220px" /></span>
      </button>)}
      <span className="shelf-board" aria-hidden="true" />
    </div>
    <div className="shelf-caption" aria-live="polite">
      <div className="shelf-mask"><p key={current.slug} className="shelf-title shelf-roll">{current.title}</p></div>
      <div className="shelf-mask"><p key={`${current.slug}-price`} className="shelf-price shelf-roll">
        {current.onSale ? <><s>{rupees(current.regular)}</s> {rupees(current.price)}</> : rupees(current.price)}
        {!current.saleable && <span className="shelf-soon"> · Not yet on sale</span>}</p></div>
      <Link className="btn btn-primary" href={`/books/${encodeURIComponent(current.slug)}`}>View add-on <span aria-hidden="true">→</span></Link>
    </div>
    <div className="shelf-controls">
      <button type="button" className="round-btn" onClick={() => go(-1)} aria-label="Previous add-on"><ChevronLeft size={17} aria-hidden="true" /></button>
      <button type="button" className="round-btn" onClick={() => go(1)} aria-label="Next add-on"><ChevronRight size={17} aria-hidden="true" /></button>
    </div>
  </section>;
}
