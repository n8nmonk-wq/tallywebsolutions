"use client";

import { Heart } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useWishlist } from "./WishlistProvider";

export default function WishlistButton({ slug, title, variant = "card" }: { slug: string; title: string; variant?: "card" | "page" }) {
  const wishlist = useWishlist();
  const reduced = useReducedMotion();
  const on = wishlist.has(slug);
  return <motion.button type="button" className={`heart-btn heart-${variant}`} aria-pressed={on} disabled={!wishlist.ready}
    aria-label={on ? `Remove ${title} from wishlist` : `Add ${title} to wishlist`} onClick={() => wishlist.toggle(slug)}
    whileTap={{ scale: reduced ? 1 : .8 }} animate={{ scale: on && !reduced ? [1, 1.25, 1] : 1 }} transition={{ duration: .25 }}>
    <Heart size={variant === "page" ? 20 : 18} fill={on ? "currentColor" : "none"} aria-hidden="true" />
  </motion.button>;
}
