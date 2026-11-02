"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { rupees } from "@/lib/money";
import type { Suggestion } from "@/lib/search";

type Option = { key: string; href: string; label: string; detail?: string; cover?: string | null };

export default function SearchBox() {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Suggestion | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const latest = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  // "/" jumps to search from anywhere on the page, as in most catalogues.
  useEffect(() => {
    const focus = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) { e.preventDefault(); input.current?.focus(); }
    };
    addEventListener("keydown", focus);
    return () => removeEventListener("keydown", focus);
  }, []);
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setResult(null); return; }
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`);
        if (!response.ok) throw new Error();
        const data = await response.json() as Suggestion;
        if (ticket === latest.current) { setResult(data); setActive(-1); setOpen(true); }
      } catch { if (ticket === latest.current) setResult(null); }
    }, 150);
    return () => clearTimeout(timer);
  }, [value]);
  const options: Option[] = result ? [
    ...result.books.map((b) => ({ key: `b-${b.slug}`, href: `/books/${encodeURIComponent(b.slug)}`, label: b.title, cover: b.cover,
      detail: [b.authorship, b.saleable && b.price > 0 ? rupees(b.price) : null].filter(Boolean).join(" · ") })),
    ...result.authors.map((a) => ({ key: `a-${a.id}`, href: `/authors/${encodeURIComponent(a.id)}`, label: a.name, detail: "Author" })),
    ...result.categories.map((c) => ({ key: `c-${c.slug}`, href: `/category/${c.slug}`, label: c.name, detail: "Category" })),
  ] : [];
  const expanded = open && options.length > 0;
  return <form action="/search" className="header-search" role="search" onSubmit={(e) => {
    if (expanded && active >= 0) { e.preventDefault(); setOpen(false); router.push(options[active].href); }
  }}>
    <label htmlFor={`${id}-input`} className="sr-only">Search books, authors and categories</label>
    <input ref={input} id={`${id}-input`} name="q" type="search" placeholder="Search add-ons, GST, bank, invoices" autoComplete="off" value={value}
      role="combobox" aria-expanded={expanded} aria-controls={`${id}-list`} aria-autocomplete="list"
      aria-activedescendant={expanded && active >= 0 ? `${id}-opt-${active}` : undefined}
      onChange={(e) => { setValue(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" && options.length) { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % options.length); }
        if (e.key === "ArrowUp" && options.length) { e.preventDefault(); setActive((i) => (i <= 0 ? options.length - 1 : i - 1)); }
        if (e.key === "Escape") { setOpen(false); setActive(-1); }
      }} />
    <button type="submit" aria-label="Search"><Search size={19} strokeWidth={2} aria-hidden="true" /></button>
    <kbd className="search-key" aria-hidden="true">/</kbd>
    {expanded && <ul id={`${id}-list`} role="listbox" className="suggest-list" aria-label="Suggestions">{options.map((o, i) =>
      <li key={o.key} id={`${id}-opt-${i}`} role="option" aria-selected={i === active} className={i === active ? "active" : undefined}
        onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)}>
        <Link href={o.href} onClick={() => setOpen(false)} tabIndex={-1}>
          {o.cover !== undefined && <span className="suggest-cover">{o.cover && <img src={o.cover} alt="" />}</span>}
          <span><span className="suggest-label">{o.label}</span>{o.detail && <span className="suggest-detail">{o.detail}</span>}</span></Link></li>)}
      <li role="option" aria-selected={false} className="suggest-all"><Link href={`/search?q=${encodeURIComponent(value.trim())}`} tabIndex={-1}>See all results for "{value.trim()}"</Link></li>
    </ul>}
  </form>;
}
