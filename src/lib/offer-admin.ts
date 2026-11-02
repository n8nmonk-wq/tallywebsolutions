import crypto from "node:crypto";
import { sql, logEvent } from "./db";
import { normaliseCode, type Offer } from "./offers";

export class OfferError extends Error {}
export type OfferInput = Omit<Offer, "uses" | "created_at" | "id"> & { id?: string };
type Row = Offer & { updated_at: string };

const KINDS = ["percent", "flat", "bxgy", "bundle"] as const;
const SCOPES = ["all", "books", "collection", "category", "order"] as const;
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string, min: number, max: number, label: string) => {
  const v = text(f, k);
  if (!v) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new OfferError(`${label} must be a whole number between ${min} and ${max}.`);
  return n;
};
const paise = (f: FormData, k: string, label: string) => {
  const v = text(f, k);
  if (!v) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(v)) throw new OfferError(`${label} must be an amount in rupees.`);
  return Math.round(Number(v) * 100);
};
// datetime-local inputs carry no zone; the admin enters India time.
const india = (v: string) => (v ? (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00+05:30` : (() => { throw new OfferError("Use the date and time picker."); })()) : null);

export function parseOffer(f: FormData): OfferInput {
  const kind = text(f, "kind") as Offer["kind"], scope = text(f, "scope") as Offer["scope"];
  if (!KINDS.includes(kind as never) || !SCOPES.includes(scope as never)) throw new OfferError("Choose an offer type and what it applies to.");
  const name = text(f, "name");
  if (!name || name.length > 120) throw new OfferError("Give the offer a name (up to 120 characters).");
  const targets = scope === "books" ? f.getAll("book_slugs").map(String) : scope === "collection" ? [text(f, "collection")] : scope === "category" ? [text(f, "category")] : [];
  if (scope !== "all" && scope !== "order" && !targets.filter(Boolean).length) throw new OfferError("Choose at least one book, collection or subject.");
  let value = 0;
  if (kind === "percent") value = int(f, "value", 1, 90, "Percent off") ?? 0;
  if (kind === "percent" && !value) throw new OfferError("Percent off must be a whole number between 1 and 90.");
  if (kind === "flat") value = paise(f, "value", "Amount off") ?? 0;
  if (kind === "flat" && value <= 0) throw new OfferError("Enter the amount off in rupees.");
  const buy_qty = kind === "bxgy" ? int(f, "buy_qty", 1, 20, "Buy") : null, get_qty = kind === "bxgy" ? int(f, "get_qty", 1, 20, "Get") : null;
  if (kind === "bxgy" && (!buy_qty || !get_qty)) throw new OfferError("Buy and get quantities are needed.");
  const bundle_qty = kind === "bundle" ? int(f, "bundle_qty", 2, 20, "Bundle size") : null, bundle_price = kind === "bundle" ? paise(f, "bundle_price", "Bundle price") : null;
  if (kind === "bundle" && (!bundle_qty || !bundle_price)) throw new OfferError("A bundle needs a size and a price.");
  const raw = text(f, "code"), code = raw ? normaliseCode(raw) : null;
  if (code !== null && !/^[A-Z0-9-]{3,32}$/.test(code)) throw new OfferError("Codes are 3 to 32 letters, numbers or dashes.");
  const starts_at = india(text(f, "starts_at")), ends_at = india(text(f, "ends_at"));
  if (starts_at && ends_at && Date.parse(ends_at) <= Date.parse(starts_at)) throw new OfferError("The offer ends after it starts: check the dates.");
  const status = text(f, "status") === "active" ? "active" : "draft";
  return { id: text(f, "id") || undefined, name, kind, scope, targets: targets.filter(Boolean), value,
    cap: kind === "percent" ? paise(f, "cap", "Cap") : null, buy_qty, get_qty, get_percent: kind === "bxgy" ? int(f, "get_percent", 1, 100, "Get discount") ?? 100 : null,
    bundle_qty, bundle_price, min_items: int(f, "min_items", 0, 20, "Minimum books") ?? 0, min_subtotal: paise(f, "min_subtotal", "Minimum order") ?? 0,
    code, combinable: f.get("combinable") === "on", first_order_only: f.get("first_order_only") === "on",
    usage_limit: int(f, "usage_limit", 1, 1000000, "Total uses"), per_customer_limit: int(f, "per_customer_limit", 1, 1000, "Uses per customer"),
    priority: int(f, "priority", -100, 100, "Priority") ?? 0, starts_at, ends_at, status };
}

export async function saveOffer(o: OfferInput): Promise<string> {
  const id = o.id ?? crypto.randomUUID();
  try {
    await sql`insert into offers (id,name,kind,scope,targets,value,cap,buy_qty,get_qty,get_percent,bundle_qty,bundle_price,min_items,min_subtotal,code,combinable,
        first_order_only,usage_limit,per_customer_limit,priority,starts_at,ends_at,status)
      values (${id},${o.name},${o.kind},${o.scope},${JSON.stringify(o.targets)}::jsonb,${o.value},${o.cap},${o.buy_qty},${o.get_qty},${o.get_percent},${o.bundle_qty},
        ${o.bundle_price},${o.min_items},${o.min_subtotal},${o.code},${o.combinable},${o.first_order_only},${o.usage_limit},${o.per_customer_limit},${o.priority},
        ${o.starts_at},${o.ends_at},${o.status})
      on conflict (id) do update set name=excluded.name,kind=excluded.kind,scope=excluded.scope,targets=excluded.targets,value=excluded.value,cap=excluded.cap,
        buy_qty=excluded.buy_qty,get_qty=excluded.get_qty,get_percent=excluded.get_percent,bundle_qty=excluded.bundle_qty,bundle_price=excluded.bundle_price,
        min_items=excluded.min_items,min_subtotal=excluded.min_subtotal,code=excluded.code,combinable=excluded.combinable,first_order_only=excluded.first_order_only,
        usage_limit=excluded.usage_limit,per_customer_limit=excluded.per_customer_limit,priority=excluded.priority,starts_at=excluded.starts_at,
        ends_at=excluded.ends_at,status=excluded.status,updated_at=now()`;
  } catch (error) {
    if (/offers_code_key|duplicate key/.test(String((error as Error)?.message))) throw new OfferError("Another offer already uses that code.");
    throw error;
  }
  await logEvent(null, "admin.offer.saved", { id, name: o.name });
  return id;
}

export async function setOfferStatus(id: string, status: "active" | "paused" | "archived") {
  await sql`update offers set status=${status}, updated_at=now() where id=${id}`;
  await logEvent(null, `admin.offer.${status}`, { id });
}

export async function duplicateOffer(id: string): Promise<string> {
  const copy = crypto.randomUUID();
  await sql`insert into offers (id,name,kind,scope,targets,value,cap,buy_qty,get_qty,get_percent,bundle_qty,bundle_price,min_items,min_subtotal,code,combinable,
      first_order_only,usage_limit,per_customer_limit,priority,starts_at,ends_at,status)
    select ${copy}, left('Copy of ' || name, 120),kind,scope,targets,value,cap,buy_qty,get_qty,get_percent,bundle_qty,bundle_price,min_items,min_subtotal,null,combinable,
      first_order_only,usage_limit,per_customer_limit,priority,starts_at,ends_at,'draft' from offers where id=${id}`;
  await logEvent(null, "admin.offer.duplicated", { id, copy });
  return copy;
}

export async function listOffers(): Promise<Row[]> {
  return await sql`select *, 0 as uses, to_json(starts_at)#>>'{}' as starts_at, to_json(ends_at)#>>'{}' as ends_at,
      to_json(created_at)#>>'{}' as created_at, to_json(updated_at)#>>'{}' as updated_at
    from offers o order by (o.status = 'archived'), o.created_at desc` as Row[];
}

/** Paid redemptions per offer: uses, discount given, and revenue of those orders. */
export async function offerStats(): Promise<Record<string, { uses: number; given: number; revenue: number }>> {
  const rows = await sql`select r.offer_id, count(*)::int as uses, sum(r.discount)::int as given, sum(o.total)::int as revenue
    from offer_redemptions r join orders o on o.id = r.order_id group by r.offer_id` as { offer_id: string; uses: number; given: number; revenue: number }[];
  return Object.fromEntries(rows.map(({ offer_id, ...s }) => [offer_id, s]));
}

export async function offersReady(): Promise<boolean> {
  // Every piece of setup must exist; a half-applied run brings the button back and re-running repairs it.
  const [row] = await sql`select to_regclass('public.offers') is not null and to_regclass('public.offer_redemptions') is not null
    and (select count(*) from information_schema.columns where table_name = 'orders' and column_name in ('discount','offers')) = 2 as ok` as { ok: boolean }[];
  return !!row?.ok;
}

/** Applies migrations/008-offers.sql statement by statement (it has no $$ blocks); additive and idempotent. */
export async function setupOffers(migration: string) {
  for (const statement of migration.replace(/^--.*$/gm, "").split(/;\s*\n/).map((s) => s.trim()).filter(Boolean))
    await sql(Object.assign([statement], { raw: [statement] }) as unknown as TemplateStringsArray);
  await logEvent(null, "admin.offer.setup", {});
}
