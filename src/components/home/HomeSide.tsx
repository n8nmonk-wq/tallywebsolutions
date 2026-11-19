import Link from "next/link";
import { Library } from "lucide-react";
import Cover from "../Cover";
import Price from "../Price";
import type { PublicBook } from "../book-data";
import type { Banner } from "@/lib/home";

// Two promo cards beside the hero. Each is an admin banner placed there (Banners > Where it shows), or, without one,
// a real product: the deepest saving and the newest add-on.
export function sideBooks(books: PublicBook[]) {
  const live = books.filter((b) => !b.comingSoon);
  const deal = [...live].sort((a, b) => b.saving - a.saving || b.price - a.price)[0];
  const fresh = [...live].sort((a, b) => String(b.release_date ?? "").localeCompare(String(a.release_date ?? "")) || (b.year ?? 0) - (a.year ?? 0))
    .find((b) => b.slug !== deal?.slug);
  return { deal, fresh };
}

function BannerCard({ banner }: { banner: Banner }) {
  const body = <>
    {banner.image && <picture className="side-art" aria-hidden="true">{banner.mobileImage && <source media="(max-width: 640px)" srcSet={banner.mobileImage} />}
      <img src={banner.image} alt="" loading="lazy" /></picture>}
    <span className="side-text">
      {banner.subtitle && <span className="eyebrow">{banner.subtitle}</span>}
      <span className="side-title">{banner.title}</span>
      {banner.body && <span className="side-body">{banner.body}</span>}
      {banner.href && <span className="link-line">{banner.label || "Shop now"} <span aria-hidden="true">→</span></span>}
    </span>
  </>;
  const className = `side-card side-banner${banner.image ? " has-art" : ""}`;
  return banner.href ? <Link href={banner.href} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}

function ProductCard({ book, kicker }: { book: PublicBook; kicker: string }) {
  return <Link href={`/products/${encodeURIComponent(book.slug)}`} className="side-card side-product">
    <span className="side-text">
      <span className="eyebrow">{kicker}</span>
      <span className="side-title">{book.title}</span>
      <Price book={book} />
      <span className="link-line">Shop now <span aria-hidden="true">→</span></span>
    </span>
    <span className="side-cover"><Cover src={book.cover} title={book.title} sizes="140px" /></span>
  </Link>;
}

export default function HomeSide({ books, banners = { first: null, second: null } }: { books: PublicBook[]; banners?: { first: Banner | null; second: Banner | null } }) {
  const { deal, fresh } = sideBooks(books);
  const first = banners.first ? <BannerCard banner={banners.first} /> : deal ? <ProductCard book={deal} kicker="Deal of the day" /> : null;
  const second = banners.second ? <BannerCard banner={banners.second} />
    : fresh ? <ProductCard book={fresh} kicker="New arrival" />
    : <Link href="/library" className="side-card side-product"><span className="side-text"><span className="eyebrow">Your library</span>
        <span className="side-title">Every add-on you buy, ready to re-download</span><span className="link-line">Open library <span aria-hidden="true">→</span></span></span>
        <span className="side-icon" aria-hidden="true"><Library size={40} strokeWidth={1.4} /></span></Link>;
  if (!first) return null;
  return <aside className="home-side" aria-label="Deals">{first}{second}</aside>;
}
