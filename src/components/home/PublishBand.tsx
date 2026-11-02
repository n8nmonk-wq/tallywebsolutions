import Link from "next/link";
import Cover from "../Cover";

export default function PublishBand({ covers }: { covers: { slug: string; title: string; cover: string | null }[] }) {
  return <section className="wrap section"><div className="publish-band reveal">
    <div><p className="eyebrow">For developers</p><h2>Sell your Tally add-on with us</h2>
      <p>Share your TDL add-on with Tally users across India.</p>
      <Link className="btn btn-primary" href="/publish">Submit an add-on <span aria-hidden="true">→</span></Link></div>
    <div className="publish-stack" aria-hidden="true">{covers.slice(0, 3).map((c) => <span key={c.slug}><Cover src={c.cover} title={c.title} sizes="120px" /></span>)}</div>
  </div></section>;
}
