"use client";

import Link from "next/link";
import Cover from "@/components/Cover";
import { useRef, useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { cartTotals, useCart } from "@/components/CartProvider";
import type { PublicBook } from "@/components/book-data";
import { rupees } from "@/lib/money";
import PricingSummary from "@/components/PricingSummary";
import { useCoupon, usePricing } from "@/components/usePricing";

type Field = "name" | "email" | "phone";
const CHECKOUT_KEY = "ayurveda-book-store-checkout";

// Only known customer messages may cross from the API into the checkout page.
const customerErrors: Record<string, { message: string; field?: Field }> = {
  "Please enter your full name.": { message: "Please enter your full name.", field: "name" },
  "That name is too long.": { message: "Use no more than 100 characters for your name.", field: "name" },
  "Email is required.": { message: "Enter your email address.", field: "email" },
  "Enter a valid email address.": { message: "Enter a valid email address.", field: "email" },
  "Please use a permanent email address your book is delivered there.": { message: "Use a permanent email address so you can receive your book.", field: "email" },
  "Phone number is required.": { message: "Enter your mobile number.", field: "phone" },
  "Enter a 10-digit Indian mobile number.": { message: "Enter a 10-digit Indian mobile number.", field: "phone" },
  "That is not a valid mobile number.": { message: "Enter a valid Indian mobile number.", field: "phone" },
  "A selected book is not available for sale.": { message: "A selected edition is no longer available to buy. Please review your selection." },
  "This order was refunded.": { message: "This order has been refunded. Please review it in your library." },
};

export function checkoutError(status: number, error: unknown): { message: string; field?: Field } {
  if (typeof error === "string" && Object.hasOwn(customerErrors, error)) return customerErrors[error];
  if (status === 429) return { message: "You've tried several times. Please wait a while before trying again." };
  if (status === 400) return { message: "Please check your details and selected books, then try again." };
  if (status === 403 || status === 409) return { message: "We could not continue this checkout. Please refresh the page and review your selection." };
  return { message: "Online ordering is currently unavailable. Please try again later." };
}

export default function CheckoutForm({ books, initialSlug, enabled }: { books: PublicBook[]; initialSlug?: string; enabled: boolean }) {
  const cart = useCart();
  const slugs = initialSlug ? [initialSlug] : cart.slugs;
  const selected = slugs.flatMap((slug) => books.filter((book) => book.slug === slug));
  const totals = selected.every((book) => book.saleable) ? cartTotals(selected.map((book) => ({ price_inr: book.price }))) : null;
  const totalLabel = totals ? rupees(totals.total) : "Not yet on sale";
  const unavailable = !totals || selected.length !== slugs.length || selected.some((book) => !book.saleable) || slugs.length > 20;
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; field?: Field } | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [coupon, setCoupon] = useCoupon();
  const { pricing, failed: pricingFailed, setPricing } = usePricing(unavailable ? [] : slugs, coupon);
  const submitting = useRef(false);

  async function pay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Pay only a total the customer has seen, priced by the server with offers applied.
    if (!enabled || unavailable || !pricing || !slugs.length || submitting.current) return;
    submitting.current = true;
    setBusy(true); setErr(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ slugs: [...slugs].sort(), ...form, coupon, total: pricing.total })));
      const fingerprint = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      if (!attempt.current) {
        try {
          const saved = JSON.parse(sessionStorage.getItem(CHECKOUT_KEY) || "null");
          if (saved && typeof saved.key === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(saved.key) && typeof saved.fingerprint === "string") attempt.current = saved;
        } catch { /* Storage can be unavailable; the in-memory key still survives retries. */ }
      }
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
      try { sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(attempt.current)); } catch { /* Keep the in-memory retry key. */ }
      const idempotencyKey = attempt.current.key;
      const response = await fetch("/api/checkout", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ ...(initialSlug ? { slug: initialSlug } : { slugs }), idempotencyKey, ...form, expectedTotal: pricing.total, ...(coupon ? { coupon } : {}) }),
      });
      const data = await response.json();
      if (response.status === 409 && data.error === "Prices changed." && data.pricing) {
        setPricing(data.pricing);
        setErr({ message: "Prices were updated. Check the new total." });
      } else if (!response.ok) {
        setErr(checkoutError(response.status, data.error));
      } else if (data.pending || response.status === 202) {
        setErr({ message: "Your payment link is still being prepared. Please retry in a moment." });
      } else if (typeof data.paymentUrl === "string") {
        const destination = new URL(data.paymentUrl);
        if (destination.protocol !== "https:") throw new Error("Invalid payment destination.");
        window.location.assign(destination.href);
        return;
      } else if (typeof data.orderId === "string" && /^[A-Za-z0-9_-]+$/.test(data.orderId)) {
        window.location.assign(`/order/${encodeURIComponent(data.orderId)}`);
        return;
      } else { throw new Error("No payment destination."); }
    } catch {
      setErr({ message: "We could not open your payment page. Please try again." });
    }
    setBusy(false); submitting.current = false;
  }

  if (!initialSlug && !cart.ready) return <p role="status">Loading your selection...</p>;
  if (!slugs.length) return <div className="empty-state"><h2>Your bag is empty.</h2><p>Choose a digital edition before checking out.</p><Link className="btn btn-primary" href="/search">Explore the books <ArrowRight size={17} aria-hidden="true" /></Link></div>;
  return <>
    <div className="checkout-layout">
      <form onSubmit={pay} className="checkout-form" aria-label="Customer details">
        {!enabled && <p className="purchase-paused">Online ordering is currently unavailable. <Link className="underline" href="/search">Continue browsing</Link> or return later.</p>}
        {enabled && unavailable && <p className="purchase-paused">{slugs.length > 20 ? "Choose up to twenty titles per checkout." : "A selected edition is not currently available to buy."} <Link className="underline" href={initialSlug ? `/books/${encodeURIComponent(initialSlug)}` : "/cart"}>{initialSlug ? "View book details" : "Review your bag"}</Link>.</p>}
        {([{ key: "name", label: "Full name", type: "text", autoComplete: "name", maxLength: 100 },
          { key: "email", label: "Email address", type: "email", autoComplete: "email", maxLength: 254 },
          { key: "phone", label: "Indian mobile number", type: "tel", autoComplete: "tel", maxLength: 32 }] as const).map((field) => <div key={field.key}>
            <label className="field-label" htmlFor={`checkout-${field.key}`}>{field.label}</label>
            <input className="field-input" id={`checkout-${field.key}`} name={field.key} type={field.type} autoComplete={field.autoComplete}
              required maxLength={field.maxLength} value={form[field.key]} disabled={busy || !enabled || unavailable}
              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              aria-invalid={err?.field === field.key || undefined}
              aria-describedby={err?.field === field.key ? "checkout-error" : field.key === "email" ? "email-hint" : field.key === "phone" ? "phone-hint" : undefined} />
            {field.key === "email" && <p className="small muted" id="email-hint">Your receipt and access details will be sent here. Signed-in purchases use your account email.</p>}
            {field.key === "phone" && <p className="small muted" id="phone-hint">Use your 10-digit Indian mobile number.</p>}
          </div>)}
        <button className="btn btn-primary" type="submit" disabled={busy || !enabled || unavailable || !pricing || !selected.length}>
          <LockKeyhole size={17} aria-hidden="true" />{!enabled || unavailable ? "Payment unavailable" : busy ? "Preparing payment..." : !pricing ? (pricingFailed ? "Payment unavailable" : "Checking prices...") : `Continue to pay ${rupees(pricing.total)}`}
        </button>
        {pricingFailed && enabled && !unavailable && <p className="small text-danger mt-4" role="alert">Prices could not be loaded. <a className="underline" href="">Refresh the page</a> to try again.</p>}
        {err && <p className="small text-danger mt-4" id="checkout-error" role="alert">{err.message}</p>}
        <noscript><p className="small">JavaScript is required to complete checkout.</p></noscript>
        <p className="checkout-policy">By continuing, you agree to our <Link href="/terms">terms</Link> and <Link href="/refund-policy">refund policy</Link>. Digital editions are licensed for personal use.</p>
      </form>
      <aside className="order-summary"><h2>Your editions</h2>{selected.map((book) => <div className="summary-line with-cover" key={book.slug}><span className="summary-cover"><Cover src={book.cover} title={book.title} sizes="40px" /></span><span>{book.title}</span><span>{book.saleable && book.price > 0 ? rupees(book.price) : "Not yet on sale"}</span></div>)}
        {totals && totals.tax > 0 && <div className="summary-line"><span>Tax</span><span>{rupees(totals.tax)}</span></div>}
        <PricingSummary pricing={pricing} coupon={coupon} setCoupon={setCoupon} fallback={totalLabel} />
        <p className="small muted mt-4">Prices and availability are checked again before payment. <Link href="/delivery-policy" className="underline">Delivery details</Link></p>
        <Link className="text-link mt-4" href={initialSlug ? `/books/${encodeURIComponent(initialSlug)}` : "/cart"}>Review selection <ArrowRight size={16} aria-hidden="true" /></Link>
      </aside>
    </div>
  </>;
}
