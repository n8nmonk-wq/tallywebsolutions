import Link from "next/link";

export default function AuthorChips({ authors }: { authors: { id: string; name: string; photo_url: string | null }[] }) {
  if (!authors.length) return null;
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <section className="wrap section"><div className="section-head reveal"><h2>Built by</h2></div>
    <ul className="author-row">{authors.map((a) => <li key={a.id} className="reveal"><Link className="author-chip" href={`/authors/${encodeURIComponent(a.id)}`}>
      <span className="author-face">{a.photo_url ? <img src={a.photo_url} alt="" loading="lazy" /> : <span aria-hidden="true">{initials(a.name)}</span>}</span>
      <span>{a.name}</span></Link></li>)}</ul></section>;
}
