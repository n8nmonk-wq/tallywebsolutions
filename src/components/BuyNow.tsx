"use client";

import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { useCart } from "./CartProvider";

export default function BuyNow({ slug, title, enabled, saleable }: { slug: string; title: string; enabled: boolean; saleable: boolean }) {
  const cart = useCart();
  const router = useRouter();
  if (!enabled || !saleable) return null;
  return <button type="button" className="btn btn-dark card-add" disabled={!cart.ready} aria-label={`Buy now: ${title}`}
    onClick={() => { if (!cart.slugs.includes(slug)) cart.add(slug, { quiet: true }); router.push("/checkout"); }}><Zap size={17} aria-hidden="true" /> Buy now</button>;
}
