import Link from "next/link";
import Cover from "../Cover";

export default function CategoryTiles({ tiles }: { tiles: { slug: string; name: string; count: number; covers: string[] }[] }) {
  if (!tiles.length) return null;
  return <section className="wrap section">
    <div className="section-head reveal"><h2>Browse by category</h2><Link className="link-line" href="/search">All add-ons <span aria-hidden="true">→</span></Link></div>
    <ul className="tile-grid">{tiles.map((t) => <li key={t.slug} className="reveal"><Link className="cat-tile surface surface-hover surface-lit" href={`/category/${t.slug}`}>
      <span className="cat-fan plate" aria-hidden="true">{t.covers.slice(0, 3).map((c, i) => <span key={i}><Cover src={c} title={t.name} sizes="80px" /></span>)}</span>
      <span className="cat-name">{t.name}</span><span className="eyebrow">{t.count} {t.count === 1 ? "add-on" : "add-ons"}</span></Link></li>)}</ul>
  </section>;
}
