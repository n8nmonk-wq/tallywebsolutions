"use client";

import { useEffect, useState } from "react";
import type { PricedCart } from "@/lib/offers";

const COUPON_KEY = "ayurveda-book-store-coupon";

/** The coupon typed in the bag, remembered for checkout in this tab. */
export function useCoupon(): [string, (code: string) => void] {
  const [coupon, setCoupon] = useState("");
  useEffect(() => { try { setCoupon(sessionStorage.getItem(COUPON_KEY) || ""); } catch { /* storage can be unavailable */ } }, []);
  return [coupon, (code: string) => {
    setCoupon(code);
    try { if (code) sessionStorage.setItem(COUPON_KEY, code); else sessionStorage.removeItem(COUPON_KEY); } catch { /* keep in memory */ }
  }];
}

/** Server pricing (offers and coupon applied) for the bag; checkout must charge exactly this total. */
export function usePricing(slugs: string[], coupon: string) {
  const [state, setState] = useState<{ pricing: PricedCart | null; loading: boolean; failed: boolean }>({ pricing: null, loading: true, failed: false });
  const key = JSON.stringify([slugs, coupon]);
  useEffect(() => {
    if (!slugs.length) { setState({ pricing: null, loading: false, failed: false }); return; }
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fetch("/api/cart/summary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slugs, coupon: coupon || undefined }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { pricing: PricedCart | null }) => { if (live) setState({ pricing: d.pricing, loading: false, failed: false }); })
      .catch(() => { if (live) setState({ pricing: null, loading: false, failed: true }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { ...state, setPricing: (pricing: PricedCart) => setState({ pricing, loading: false, failed: false }) };
}
