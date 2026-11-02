import Link from "next/link";
import { ChevronDown } from "lucide-react";
import Cover from "./Cover";
import type { NavCategory } from "@/lib/navigation";

type Preview = { slug: string; title: string; cover: string };

export default function CategoryBar({ nav, previews }: { nav: { primary: NavCategory[]; more: NavCategory[] }; previews: Record<string, Preview[]> }) {
  const all = [...nav.primary, ...nav.more];
  const coversFor = (c: NavCategory) => [...(previews[c.slug] ?? []), ...c.children.flatMap((child) => previews[child.slug] ?? [])].slice(0, 3);
  return <nav className="category-bar" aria-label="Categories"><div className="wrap category-row">
    {all.length > 0 ? <div className="mega"><Link className="mega-trigger" href="/search">All books <ChevronDown size={14} aria-hidden="true" /></Link>
      <div className="mega-panel mega-all">{all.map((c) => <div key={c.slug} className="mega-links"><Link className="mega-head" href={`/category/${c.slug}`}>{c.name}</Link>
        {c.children.map((child) => <Link key={child.slug} href={`/category/${child.slug}`}>{child.name}</Link>)}</div>)}</div></div>
      : <Link href="/search">All books</Link>}
    <Link href="/search?sort=new">New arrivals</Link>
    <Link href="/search?sort=popular">Bestsellers</Link>
    {nav.primary.map((c) => {
      const covers = coversFor(c);
      if (!c.children.length && !covers.length) return <Link key={c.slug} href={`/category/${c.slug}`}>{c.name}</Link>;
      return <div className="mega" key={c.slug}><Link className="mega-trigger" href={`/category/${c.slug}`}>{c.name} <ChevronDown size={14} aria-hidden="true" /></Link>
        <div className="mega-panel">
          <div className="mega-links"><Link className="mega-head" href={`/category/${c.slug}`}>All {c.name}</Link>{c.children.map((child) => <Link key={child.slug} href={`/category/${child.slug}`}>{child.name}</Link>)}</div>
          {covers.length > 0 && <div className="mega-covers">{covers.map((b) => <Link key={b.slug} href={`/books/${encodeURIComponent(b.slug)}`}><Cover src={b.cover} title={b.title} sizes="72px" /></Link>)}</div>}
        </div></div>;
    })}
    <Link href="/search?offer=1" className="deal-link">Offers &amp; deals</Link>
  </div></nav>;
}
