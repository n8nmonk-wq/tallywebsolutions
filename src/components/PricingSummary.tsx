"use client";

import { useState } from "react";
import { BadgePercent, TicketPercent, X } from "lucide-react";
import type { PricedCart } from "@/lib/offers";
import { rupees } from "@/lib/money";

/** Subtotal, each applied offer, the coupon box and the total: the same numbers checkout charges. */
export default function PricingSummary({ pricing, coupon, setCoupon, fallback, subtotal = true }: {
  pricing: PricedCart | null; coupon: string; setCoupon: (code: string) => void; fallback: string; subtotal?: boolean;
}) {
  return <>
    {pricing && pricing.discount > 0 && <>
      {subtotal && <div className="summary-line"><span>Subtotal</span><span>{rupees(pricing.subtotal)}</span></div>}
      {pricing.applied.map((a) => <div className="summary-line applied-offer" key={a.id}><span><BadgePercent size={15} aria-hidden="true" />{a.code ? `Code ${a.code}` : a.name}</span><span>−{rupees(a.saving)}</span></div>)}
    </>}
    {pricing && <CouponBox coupon={coupon} setCoupon={setCoupon} result={pricing.coupon} />}
    <div className="summary-line summary-total"><span>Total</span><span>{pricing ? rupees(pricing.total) : fallback}</span></div>
    {pricing && pricing.discount > 0 && <p className="you-save">You save {rupees(pricing.discount)}</p>}
  </>;
}

export function CouponBox({ coupon, setCoupon, result }: { coupon: string; setCoupon: (code: string) => void; result: PricedCart["coupon"] }) {
  const [draft, setDraft] = useState(coupon);
  if (coupon && result?.ok) return <p className="coupon-applied"><TicketPercent size={15} aria-hidden="true" />Code {result.code} applied
    <button type="button" className="icon-plain" aria-label="Remove code" onClick={() => { setCoupon(""); setDraft(""); }}><X size={15} aria-hidden="true" /></button></p>;
  return <form className="coupon-box" onSubmit={(e) => { e.preventDefault(); setCoupon(draft.trim()); }}>
    <label className="sr-only" htmlFor="coupon-code">Coupon code</label>
    <input id="coupon-code" className="field-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Coupon code" maxLength={40} autoCapitalize="characters" />
    <button className="btn btn-ghost" type="submit" disabled={!draft.trim()}>Apply</button>
    {coupon && result && !result.ok && <p className="small text-danger" role="alert">{result.message}</p>}
  </form>;
}
