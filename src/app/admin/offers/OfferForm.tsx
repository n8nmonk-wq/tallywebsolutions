"use client";

import { useState } from "react";
import { offerBadge, type Offer } from "@/lib/offers";
import BookPicker from "../platform/BookPicker";

type Option = { slug: string; name: string };
const input = "field-input mt-1";
const rupees = (p: number | null | undefined) => (p == null ? "" : String(p / 100));
// Stored instants are shown and entered in India time.
const toIndia = (v: string | null) => (v ? new Date(Date.parse(v) + 330 * 60000).toISOString().slice(0, 16) : "");

export default function OfferForm({ offer, books, collections, categories }: {
  offer?: Offer; books: { slug: string; title: string }[]; collections: Option[]; categories: Option[];
}) {
  const [kind, setKind] = useState<Offer["kind"]>(offer?.kind ?? "percent");
  const [scope, setScope] = useState<Offer["scope"]>(offer?.scope ?? "all");
  const [draft, setDraft] = useState({ value: offer ? (offer.kind === "flat" ? rupees(offer.value) : String(offer.value)) : "20", buy: String(offer?.buy_qty ?? 2),
    get: String(offer?.get_qty ?? 1), getPct: String(offer?.get_percent ?? 100), qty: String(offer?.bundle_qty ?? 3), price: rupees(offer?.bundle_price) || "499", code: offer?.code ?? "" });
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });
  const preview = offerBadge({ kind, value: kind === "flat" ? Math.round(Number(draft.value || 0) * 100) : Number(draft.value || 0), buy_qty: Number(draft.buy), get_qty: Number(draft.get),
    get_percent: Number(draft.getPct), bundle_qty: Number(draft.qty), bundle_price: Math.round(Number(draft.price || 0) * 100), code: null } as Offer);
  return <form action="/api/admin/offers" method="post" className="grid gap-4">
    <input type="hidden" name="action" value="save" />{offer && <input type="hidden" name="id" value={offer.id} />}
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-bg-2 px-4 py-3 text-sm"><span className="text-ink-soft">Customers see</span>
      <span className="pill-offer">{preview}</span>{draft.code && <span className="pill-offer">Code {draft.code.toUpperCase()}</span>}</div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Name (admin only)<input name="name" required maxLength={120} defaultValue={offer?.name ?? ""} placeholder="Diwali 20% off" className={input} /></label>
      <label className="text-sm">Offer type<select name="kind" value={kind} onChange={(e) => setKind(e.target.value as Offer["kind"])} className={input}>
        <option value="percent">Percent off</option><option value="flat">Amount off (₹)</option><option value="bxgy">Buy X get Y</option><option value="bundle">Bundle price</option></select></label>
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      {kind === "percent" && <><label className="text-sm">Percent off<input name="value" inputMode="numeric" required value={draft.value} onChange={set("value")} className={input} /></label>
        <label className="text-sm">Max discount ₹ (optional)<input name="cap" inputMode="decimal" defaultValue={rupees(offer?.cap)} className={input} /></label></>}
      {kind === "flat" && <label className="text-sm">Amount off ₹ {scope === "order" ? "(whole order)" : "(each add-on)"}<input name="value" inputMode="decimal" required value={draft.value} onChange={set("value")} className={input} /></label>}
      {kind === "bxgy" && <><label className="text-sm">Buy<input name="buy_qty" inputMode="numeric" required value={draft.buy} onChange={set("buy")} className={input} /></label>
        <label className="text-sm">Get<input name="get_qty" inputMode="numeric" required value={draft.get} onChange={set("get")} className={input} /></label>
        <label className="text-sm">at % off (100 = free)<input name="get_percent" inputMode="numeric" value={draft.getPct} onChange={set("getPct")} className={input} /></label></>}
      {kind === "bundle" && <><label className="text-sm">Any (books)<input name="bundle_qty" inputMode="numeric" required value={draft.qty} onChange={set("qty")} className={input} /></label>
        <label className="text-sm">for ₹<input name="bundle_price" inputMode="decimal" required value={draft.price} onChange={set("price")} className={input} /></label></>}
    </div>
    <fieldset className="grid gap-3"><legend className="mb-1 text-sm font-medium">Applies to</legend>
      <div className="flex flex-wrap gap-2">{([["all", "All add-ons"], ["books", "Chosen books"], ["collection", "A collection"], ["category", "A subject"], ["order", "Whole order"]] as const).map(([v, label]) =>
        <label key={v} className={`chip cursor-pointer ${scope === v ? "!bg-forest !text-cream" : ""}`}><input type="radio" name="scope" value={v} checked={scope === v} onChange={() => setScope(v)} className="sr-only" />{label}</label>)}</div>
      {scope === "books" && <BookPicker books={books} selected={offer?.scope === "books" ? offer.targets : []} />}
      {scope === "collection" && <select name="collection" required defaultValue={offer?.scope === "collection" ? offer.targets[0] : ""} className="field-input">
        <option value="" disabled>Choose a collection</option>{collections.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>}
      {scope === "category" && <select name="category" required defaultValue={offer?.scope === "category" ? offer.targets[0] : ""} className="field-input">
        <option value="" disabled>Choose a subject</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>}
    </fieldset>
    <details className="rounded-lg border border-line px-4 py-3" open={!!(offer?.code || offer?.usage_limit || offer?.min_subtotal || offer?.starts_at)}>
      <summary className="cursor-pointer text-sm font-medium">Code, schedule and limits</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-sm">Coupon code (optional)<input name="code" value={draft.code} onChange={set("code")} placeholder="SAVE10" className={`${input} uppercase`} /></label>
        <label className="text-sm">Starts (India time)<input name="starts_at" type="datetime-local" defaultValue={toIndia(offer?.starts_at ?? null)} className={input} /></label>
        <label className="text-sm">Ends (India time)<input name="ends_at" type="datetime-local" defaultValue={toIndia(offer?.ends_at ?? null)} className={input} /></label>
        <label className="text-sm">Minimum books<input name="min_items" inputMode="numeric" defaultValue={offer?.min_items || ""} className={input} /></label>
        <label className="text-sm">Minimum order ₹<input name="min_subtotal" inputMode="decimal" defaultValue={offer?.min_subtotal ? rupees(offer.min_subtotal) : ""} className={input} /></label>
        <label className="text-sm">Priority (ties)<input name="priority" inputMode="numeric" defaultValue={offer?.priority || ""} className={input} /></label>
        <label className="text-sm">Total uses<input name="usage_limit" inputMode="numeric" defaultValue={offer?.usage_limit ?? ""} placeholder="Unlimited" className={input} /></label>
        <label className="text-sm">Uses per customer<input name="per_customer_limit" inputMode="numeric" defaultValue={offer?.per_customer_limit ?? ""} placeholder="Unlimited" className={input} /></label>
        <div className="grid content-end gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="first_order_only" defaultChecked={offer?.first_order_only} />First order only</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="combinable" defaultChecked={offer?.combinable} />Code stacks with other offers</label></div>
      </div>
    </details>
    <div className="flex flex-wrap gap-3">
      <button className="btn btn-primary" type="submit" name="status" value="active">{offer?.status === "active" ? "Save" : "Save and go live"}</button>
      <button className="btn btn-ghost" type="submit" name="status" value="draft">Save as draft</button>
    </div>
  </form>;
}
