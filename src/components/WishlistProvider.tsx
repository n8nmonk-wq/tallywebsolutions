"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { parseWishlist } from "@/lib/wishlist-parse";

export const WISHLIST_KEY = "ayurveda-book-store-wishlist";

type Wishlist = { slugs: string[]; ready: boolean; has: (slug: string) => boolean; toggle: (slug: string) => void };
const WishlistContext = createContext<Wishlist | null>(null);
const save = (slugs: string[]) => { try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(slugs)); } catch { /* storage blocked: keep in memory */ } };

export default function WishlistProvider({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let local: string[] = [];
    try { local = parseWishlist(localStorage.getItem(WISHLIST_KEY)); } catch { /* storage blocked */ }
    setSlugs(local);
    setReady(true);
    if (!signedIn) return;
    fetch("/api/wishlist/merge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slugs: local }) })
      .then((r) => r.ok ? r.json() : Promise.reject()).then((data: { slugs: string[] }) => { setSlugs(data.slugs); save(data.slugs); })
      .catch(() => { /* keep local list; sync retries on the next page load */ });
  }, [signedIn]);
  const toggle = useCallback((slug: string) => {
    setSlugs((current) => {
      const removing = current.includes(slug);
      const next = removing ? current.filter((s) => s !== slug) : parseWishlist(JSON.stringify([slug, ...current]));
      save(next);
      if (signedIn) fetch("/api/wishlist", { method: removing ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) }).catch(() => {});
      return next;
    });
  }, [signedIn]);
  return <WishlistContext.Provider value={{ slugs, ready, has: (slug) => slugs.includes(slug), toggle }}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const value = useContext(WishlistContext);
  if (!value) throw new Error("Wishlist controls require WishlistProvider.");
  return value;
}
