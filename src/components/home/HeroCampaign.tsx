"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleCheck, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { Banner } from "@/lib/home";
import Book3D from "../motion/Book3D";

type HeroCover = { slug: string; title: string; cover: string | null };

export const DEFAULT_SLIDE: Banner = { id: "default", title: "Tally add-ons, delivered instantly", subtitle: "Digital downloads",
  body: "TDL source code and GST add-ons for TallyPrime. Pay once, use with lifetime validity.", image: null, mobileImage: null, href: "/search", label: "Browse add-ons", theme: "forest" };

// The last two words of a headline carry the brand gradient, so admin banners get it without markup.
export function splitAccent(title: string): [string, string] {
  const words = title.trim().split(/\s+/);
  if (words.length < 3) return ["", title.trim()];
  return [`${words.slice(0, -2).join(" ")} `, words.slice(-2).join(" ")];
}

const TICKS: [string, string][] = [["Instant", "download"], ["Secure", "payment"], ["Licensed", "to you"]];

export default function HeroCampaign({ banners, covers }: { banners: Banner[]; covers: HeroCover[] }) {
  const slides = banners.length ? banners : [DEFAULT_SLIDE];
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const many = slides.length > 1;
  useEffect(() => {
    if (!many || paused || hover || reduced) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 7000);
    return () => clearInterval(timer);
  }, [many, paused, hover, reduced, slides.length]);
  useEffect(() => {
    const el = root.current;
    if (reduced || !el) return;
    const pointer = (e: PointerEvent) => { el.style.setProperty("--px", (e.clientX / innerWidth - 0.5).toFixed(3)); el.style.setProperty("--py", (e.clientY / innerHeight - 0.5).toFixed(3)); };
    const scroll = () => el.style.setProperty("--sy", Math.min(1, scrollY / 600).toFixed(3));
    addEventListener("pointermove", pointer, { passive: true });
    addEventListener("scroll", scroll, { passive: true });
    return () => { removeEventListener("pointermove", pointer); removeEventListener("scroll", scroll); };
  }, [reduced]);
  const go = (step: number) => setIndex((i) => (i + step + slides.length) % slides.length);
  const shown = covers.filter((c) => c.cover).slice(0, 3);
  return <section ref={root} className="hero-campaign" aria-roledescription={many ? "carousel" : undefined} aria-label="Featured"
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
    {slides.map((s, i) => {
      const [lead, accent] = splitAccent(s.title);
      return <div key={s.id} className="hero-slide" hidden={i !== index} role={many ? "group" : undefined}
        aria-roledescription={many ? "slide" : undefined} aria-label={many ? `${i + 1} of ${slides.length}` : undefined}>
        {s.image && <picture className="hero-art" aria-hidden="true">{s.mobileImage && <source media="(max-width: 640px)" srcSet={s.mobileImage} />}
          <img src={s.image} alt="" fetchPriority={i === 0 ? "high" : undefined} /></picture>}
        <div className="hero-grid">
          <div className="hero-copy enter">
            {s.subtitle && <span className="pill"><span className="dot" />{s.subtitle}</span>}
            <h1>{lead}<span className="grad">{accent}</span></h1>
            {s.body && <p>{s.body}</p>}
            <div className="hero-actions">{s.href && <Link className="btn btn-primary" href={s.href}>{s.label || "Browse add-ons"} <span aria-hidden="true">→</span></Link>}
              <Link className="btn btn-ghost" href="/publish">Sell with us</Link></div>
            <ul className="ticks">{TICKS.map(([strong, rest]) => <li key={strong}><CircleCheck size={16} aria-hidden="true" /><span><strong>{strong}</strong> {rest}</span></li>)}</ul>
          </div>
          {i === index && shown.length > 0 && <div className="hero-stage" aria-hidden="true">{shown.map((c, k) =>
            <Link key={c.slug} href={`/books/${encodeURIComponent(c.slug)}`} tabIndex={-1} className={`hero-cover c${k}`}>
              <Book3D src={c.cover} title={c.title} sizes="(max-width: 900px) 34vw, 200px" priority={k === 0} /></Link>)}</div>}
        </div>
      </div>;
    })}
    {many && <div className="hero-controls">
      <button type="button" className="round-btn" onClick={() => go(-1)} aria-label="Previous slide"><ChevronLeft size={17} aria-hidden="true" /></button>
      <div className="hero-dots">{slides.map((s, i) => <button key={s.id} type="button" aria-label={`Show slide ${i + 1}`} aria-current={i === index ? "true" : undefined} onClick={() => setIndex(i)} />)}</div>
      <button type="button" className="round-btn" onClick={() => go(1)} aria-label="Next slide"><ChevronRight size={17} aria-hidden="true" /></button>
      {mounted && !reduced && <button type="button" className="round-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play slides" : "Pause slides"}>
        {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}</button>}
    </div>}
  </section>;
}
