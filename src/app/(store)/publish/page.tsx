import Link from "next/link";
import { getReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sell with us", robots: { index: true, follow: true } };
export default async function PublishPage() {
  const reader = await getReader();
  const start = reader ? "/author" : "/login?next=/author";
  return <div className="wrap page-shell">
    <section className="publish-band reveal"><div><p className="eyebrow">For developers</p><h1>Submit your Tally add-on</h1>
      <p>Review by our team, fair terms, Tally users across India.</p>
      <Link className="btn btn-light" href={start}>{reader ? "Open your workspace" : "Sign in to start"} <span aria-hidden="true">→</span></Link></div></section>
    <section className="section"><div className="section-head"><h2>How it works</h2></div>
      <ol className="steps">{["Create your profile", "Upload files", "Editorial and rights review", "Release and sell"].map((s) => <li key={s} className="surface reveal">{s}</li>)}</ol></section>
    <section className="section"><div className="section-head"><h2>What we accept</h2></div>
      <ul className="entry-chips">{["PDF or EPUB", "Your own work or digital rights", "Cover 1600px tall or more", "Optional free sample"].map((s) => <li key={s} className="chip">{s}</li>)}</ul>
      <p className="tax-note">Approval alone does not release a title; rights, terms and clean files are required. <Link className="text-link" href="/terms">Terms</Link></p></section>
  </div>;
}
