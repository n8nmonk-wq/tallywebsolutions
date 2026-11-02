"use client";

import Link from "next/link";
import { Heart, PackageCheck, ShoppingBag, UserRound, Zap } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useCart } from "./CartProvider";
import CategoryBar from "./CategoryBar";
import SearchBox from "./SearchBox";
import { useWishlist } from "./WishlistProvider";
import type { NavCategory } from "@/lib/navigation";

type Preview = { slug: string; title: string; cover: string };

function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);
  return scrolled;
}

export default function StoreHeader({ name, nav, announcement, previews = {} }: {
  name: string; nav: { primary: NavCategory[]; more: NavCategory[] }; announcement: { title: string; link_url: string | null } | null; previews?: Record<string, Preview[]>;
}) {
  const { slugs, ready } = useCart();
  const wishlist = useWishlist();
  const reduced = useReducedMotion();
  const scrolled = useScrolled();
  const [brand, by] = name.includes(" by ") ? [name.split(" by ")[0], name.split(" by ").slice(1).join(" by ")] : [name, ""];
  const count = ready ? slugs.length : 0;
  return <header className="site-header" data-scrolled={scrolled ? "true" : undefined}>
    <div className="utility-bar"><div className="wrap utility-row">
      {announcement ? <p className="announcement-bar"><span className="dot" aria-hidden="true" />{announcement.link_url ? <Link href={announcement.link_url}>{announcement.title}</Link> : announcement.title}</p>
        : <p className="utility-perks"><span><Zap size={13} aria-hidden="true" />Instant download</span><span><PackageCheck size={13} aria-hidden="true" />Pay with UPI, cards and netbanking</span></p>}
      <nav className="utility-links" aria-label="Help"><Link href="/library">Track order</Link><Link href="/delivery-policy">Help</Link><Link href="/publish">Sell with us</Link></nav>
    </div></div>
    <div className="wrap header-row">
      <Link href="/" className="logo" aria-label={`${name}, home`}><span className="logo-word">{brand}</span>{by && <span className="eyebrow">By {by}</span>}</Link>
      <SearchBox />
      <nav className="header-icons" aria-label="Your account">
        <Link href="/library" aria-label="Your account and library"><UserRound size={21} strokeWidth={1.8} aria-hidden="true" /><span className="icon-label">Account</span></Link>
        <Link href="/wishlist" aria-label={`Wishlist, ${wishlist.slugs.length} ${wishlist.slugs.length === 1 ? "book" : "books"}`}><Heart size={21} strokeWidth={1.8} aria-hidden="true" /><span className="icon-label">Wishlist</span>{wishlist.slugs.length > 0 && <span className="count-badge">{wishlist.slugs.length}</span>}</Link>
        <Link href="/cart" id="bag-target" aria-label={`Bag, ${count} ${count === 1 ? "item" : "items"}`}>
          <ShoppingBag size={21} strokeWidth={1.8} aria-hidden="true" /><span className="icon-label">Bag</span>
          {count > 0 && <motion.span key={count} className="count-badge" initial={false} animate={{ scale: reduced ? 1 : [1, 1.3, 1] }} transition={{ duration: .3 }}>{count}</motion.span>}
        </Link>
      </nav>
    </div>
    <CategoryBar nav={nav} previews={previews} />
  </header>;
}
