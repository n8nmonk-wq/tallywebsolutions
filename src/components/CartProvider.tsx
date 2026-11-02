"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { computeTotals } from "@/lib/money";

export const CART_KEY = "ayurveda-book-store-cart";

export function cartTotals(books: { price_inr: number }[]) {
  try { return computeTotals(books.map((book) => book.price_inr)); }
  catch { return null; }
}

export function parseCart(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((slug): slug is string => typeof slug === "string" && /^[a-z0-9][a-z0-9_-]{0,100}$/.test(slug)))].slice(0, 20)
      : [];
  } catch { return []; }
}

type Cart = { slugs: string[]; ready: boolean; error: string; add: (slug: string, options?: { quiet?: boolean }) => void; remove: (slug: string) => void;
  drawerOpen: boolean; openDrawer: () => void; closeDrawer: () => void; lastAdded: string | null };
const CartContext = createContext<Cart | null>(null);

export default function CartProvider({ children }: { children: React.ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  useEffect(() => {
    try { setSlugs(parseCart(localStorage.getItem(CART_KEY))); }
    catch { setError("Your browser cannot save this cart. Keep this page open to retain your selection."); }
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key === CART_KEY || event.key === null) setSlugs(parseCart(event.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function update(next: string[]) {
    setSlugs(next);
    try { localStorage.setItem(CART_KEY, JSON.stringify(next)); setError(""); }
    catch { setError("Your browser cannot save this cart. Keep this page open to retain your selection."); }
  }
  return <CartContext.Provider value={{ slugs, ready, error,
    add: (slug, options) => { update(parseCart(JSON.stringify([...slugs, slug]))); setLastAdded(slug); if (!options?.quiet) setDrawerOpen(true); },
    remove: (slug) => update(slugs.filter((item) => item !== slug)),
    drawerOpen, openDrawer: () => setDrawerOpen(true), closeDrawer: () => setDrawerOpen(false), lastAdded,
  }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("Cart controls require CartProvider.");
  return cart;
}
