import Link from "next/link";
import { Headphones, Infinity as Lifetime, ShieldCheck, Zap } from "lucide-react";

const TRUST: [typeof Zap, string, string][] = [[Zap, "Instant download", "Right after payment"], [ShieldCheck, "Secure checkout", "Razorpay protected"], [Lifetime, "Lifetime library", "Re-download any time"], [Headphones, "Real support", "We reply within a day"]];
const PAY = ["UPI", "Visa", "Mastercard", "RuPay", "Netbanking", "Wallets"];

export default function SiteFooter({ name, categories }: { name: string; categories: { slug: string; name: string }[] }) {
  const [brand, by] = name.includes(" by ") ? [name.split(" by ")[0], name.split(" by ").slice(1).join(" by ")] : [name, ""];
  const cols: [string, [string, string][]][] = [
    ["Shop", [["All books", "/search"], ["New", "/search?sort=new"], ["Offers", "/search?offer=1"], ["Wishlist", "/wishlist"]]],
    ["Account", [["Library", "/library"], ["Bag", "/cart"], ["Sign in", "/login"]]],
    ["Help", [["Delivery", "/delivery-policy"], ["Refunds", "/refund-policy"], ["Privacy", "/privacy"], ["Terms", "/terms"]]],
    ["Authors", [["Publish with us", "/publish"], ["Workspace", "/author"]]],
  ];
  return <footer className="site-footer"><div className="wrap">
    <ul className="trust-row">{TRUST.map(([Icon, title, note]) => <li key={title}><Icon size={26} strokeWidth={1.6} aria-hidden="true" /><p><strong>{title}</strong><span>{note}</span></p></li>)}</ul>
    <div className="footer-top">
      <div><Link href="/" className="logo"><span className="logo-word">{brand}</span>{by && <span className="eyebrow">By {by}</span>}</Link>
        <p className="footer-about">Digital books. Instant download. Yours to keep.</p>
        <ul className="pay-row" aria-label="Payment methods">{PAY.map((p) => <li key={p}>{p}</li>)}</ul></div>
      {cols.map(([title, links]) => <div key={title}><h2>{title}</h2><ul>{links.map(([label, href]) => <li key={href}><Link href={href}>{label}</Link></li>)}</ul></div>)}
    </div>
    {categories.length > 0 && <div className="popular"><h2>Popular</h2><ul>{categories.slice(0, 16).map((c) =>
      <li key={c.slug}><Link className="chip" href={`/category/${c.slug}`}>{c.name}</Link></li>)}</ul></div>}
    <p className="footer-legal"><span>© {new Date().getFullYear()} {name}</span><span>Digital editions only · Prices in INR</span></p>
  </div></footer>;
}
