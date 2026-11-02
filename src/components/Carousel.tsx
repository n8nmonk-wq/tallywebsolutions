"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export default function Carousel({ title, tagline, href, label, children }: { title: string; tagline?: string; href?: string; label?: string; children: ReactNode }) {
  const track = useRef<HTMLUListElement>(null);
  const drag = useRef<{ x: number; left: number; last: number; t: number; v: number; moved: boolean } | null>(null);
  const suppress = useRef(false);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [dragging, setDragging] = useState(false);
  const measure = useCallback(() => {
    const el = track.current;
    if (el) setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);
  const page = (direction: 1 | -1) => track.current?.scrollBy({ left: direction * track.current.clientWidth * 0.9, behavior: "smooth" });
  // Mouse drag with a little momentum; touch keeps native scrolling and snap.
  const end = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || !track.current) return;
    suppress.current = d.moved;
    if (d.moved && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) track.current.scrollBy({ left: -d.v * 240, behavior: "smooth" });
  };
  const items = Children.toArray(children);
  if (!items.length) return null;
  return <section className="carousel" aria-label={label ?? title}>
    <div className="section-head reveal"><div><h2>{title}</h2>{tagline && <p>{tagline}</p>}</div>
      <div className="section-actions">
        {!(edges.start && edges.end) && <>
          <button type="button" className="round-btn" onClick={() => page(-1)} disabled={edges.start} aria-label={`Previous in ${title}`}><ChevronLeft size={19} aria-hidden="true" /></button>
          <button type="button" className="round-btn" onClick={() => page(1)} disabled={edges.end} aria-label={`Next in ${title}`}><ChevronRight size={19} aria-hidden="true" /></button></>}
        {href && <Link className="link-line" href={href}>See all <span aria-hidden="true">→</span></Link>}
      </div></div>
    <ul ref={track} className={`carousel-track${dragging ? " dragging" : ""}`} onScroll={measure}
      onPointerDown={(e) => { if (e.pointerType !== "mouse" || !track.current) return; drag.current = { x: e.clientX, left: track.current.scrollLeft, last: e.clientX, t: e.timeStamp, v: 0, moved: false }; }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !track.current) return;
        if (Math.abs(e.clientX - d.x) > 5) { d.moved = true; setDragging(true); }
        if (!d.moved) return;
        const dt = Math.max(1, e.timeStamp - d.t);
        d.v = (e.clientX - d.last) / dt; d.last = e.clientX; d.t = e.timeStamp;
        track.current.scrollLeft = d.left - (e.clientX - d.x);
      }}
      onPointerUp={end} onPointerLeave={end}
      onClickCapture={(e) => { if (suppress.current) { e.preventDefault(); e.stopPropagation(); suppress.current = false; } }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}</ul>
  </section>;
}
