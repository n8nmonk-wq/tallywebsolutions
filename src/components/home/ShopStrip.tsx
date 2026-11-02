import Link from "next/link";
import { BadgePercent, FileText, Flame, IndianRupee, Sparkles, Library } from "lucide-react";

const LINKS: [typeof Flame, string, string][] = [
  [Flame, "Bestsellers", "/search?sort=popular"], [Sparkles, "New arrivals", "/search?sort=new"], [BadgePercent, "Offers", "/search?offer=1"],
  [IndianRupee, "Under ₹199", "/search?price=0-199"], [FileText, "PDF editions", "/search?format=PDF"], [Library, "All books", "/search"],
];

export default function ShopStrip() {
  return <nav className="wrap shop-strip" aria-label="Shop by">
    {LINKS.map(([Icon, label, href]) => <Link key={label} href={href} className="shop-link"><span className="shop-icon"><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></span>{label}</Link>)}
  </nav>;
}
