"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Carousel from "./Carousel";
import Cover from "./Cover";
import { rupees } from "@/lib/money";

export const RECENT_KEY = "ayurveda-book-store-recent";
export function pushRecent(list: string[], slug: string) { return [slug, ...list.filter((s) => s !== slug)].slice(0, 12); }
type Item = { slug: string; title: string; cover: string | null; price: number; saleable: boolean };

export default function RecentlyViewed({ current }: { current: string }) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let list: string[] = [];
    try { const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); list = Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string" && /^[a-z0-9][a-z0-9_-]{0,100}$/.test(s)) : []; } catch { /* storage blocked */ }
    const next = pushRecent(list, current);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
    const others = next.filter((s) => s !== current);
    if (!others.length) return;
    fetch("/api/cart/summary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slugs: others }) })
      .then((r) => r.ok ? r.json() : Promise.reject()).then((d: { books: Item[] }) => setItems(d.books)).catch(() => {});
  }, [current]);
  if (!items.length) return null;
  return <div className="section"><Carousel title="Recently viewed">{items.map((b) => <Link key={b.slug} href={`/books/${encodeURIComponent(b.slug)}`} className="product-card recent-card">
    <span className="card-cover"><Cover src={b.cover} title={b.title} sizes="160px" /></span>
    <span className="card-body"><span className="recent-title">{b.title}</span>{b.saleable && b.price > 0 && <strong>{rupees(b.price)}</strong>}</span></Link>)}</Carousel></div>;
}
