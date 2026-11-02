/** Offers pricing: the only path from book prices to what a customer pays. All money is integer paise. */

export type Offer = {
  id: string; name: string; kind: "percent" | "flat" | "bxgy" | "bundle"; scope: "all" | "books" | "collection" | "category" | "order";
  targets: string[]; value: number; cap: number | null; buy_qty: number | null; get_qty: number | null; get_percent: number | null;
  bundle_qty: number | null; bundle_price: number | null; min_items: number; min_subtotal: number; code: string | null; combinable: boolean;
  first_order_only: boolean; usage_limit: number | null; per_customer_limit: number | null; priority: number;
  starts_at: string | null; ends_at: string | null; status: "draft" | "active" | "paused" | "archived"; uses: number; created_at: string;
};
/** `price` is today's currentPrice().price; `categories` includes ancestor subjects. */
export type CartLine = { slug: string; price: number; regular: number; categories: string[]; collections: string[] };
/** null: the email is not known yet (cart view); customer conditions are checked again at checkout. */
export type Customer = { paidOrders: number; uses: Record<string, number> } | null;
export type PricedCart = {
  lines: { slug: string; regular: number; base: number; price: number; discount: number; offers: string[] }[];
  applied: { id: string; name: string; code: string | null; saving: number }[];
  subtotal: number; discount: number; total: number;
  coupon: { code: string; ok: boolean; message: string | null } | null;
};

const MIN_TOTAL = 100;
const time = (v: string | null) => (v == null ? null : Date.parse(v));

export const normaliseCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);

export function isLive(offer: Offer, now: Date) {
  const t = now.getTime(), start = time(offer.starts_at), end = time(offer.ends_at);
  return offer.status === "active" && (start === null || start <= t) && (end === null || t < end)
    && (offer.usage_limit == null || offer.uses < offer.usage_limit);
}

const customerOk = (offer: Offer, customer: Customer | undefined) => !customer
  || (!(offer.first_order_only && customer.paidOrders > 0)
    && !(offer.per_customer_limit != null && (customer.uses[offer.id] ?? 0) >= offer.per_customer_limit));

const money = (paise: number) => `₹${paise % 100 ? (paise / 100).toFixed(2) : paise / 100}`;

export function offerBadge(offer: Offer) {
  if (offer.code) return `Code ${offer.code}`;
  if (offer.kind === "percent") return `${offer.value}% off`;
  if (offer.kind === "flat") return `${money(offer.value)} off`;
  if (offer.kind === "bxgy") return `Buy ${offer.buy_qty} get ${offer.get_qty}${(offer.get_percent ?? 100) < 100 ? ` at ${offer.get_percent}% off` : ""}`;
  return `Any ${offer.bundle_qty} for ${money(offer.bundle_price ?? 0)}`;
}

type Work = { slug: string; price: number; categories: string[]; collections: string[] };
type Result = { saving: number; perLine: Map<string, number>; used: string[] };

const eligible = (offer: Offer, line: Work) =>
  offer.scope === "all" || offer.scope === "order" ? true
    : offer.scope === "books" ? offer.targets.includes(line.slug)
      : (offer.scope === "collection" ? line.collections : line.categories).some((t) => offer.targets.includes(t));

const dearestFirst = (a: Work, b: Work) => b.price - a.price || a.slug.localeCompare(b.slug);

/** Splits `amount` by price share in whole paise; the remainder goes to the most expensive line. */
function allocate(amount: number, lines: Work[], into = new Map<string, number>()) {
  const sorted = [...lines].sort(dearestFirst);
  const sum = sorted.reduce((s, l) => s + l.price, 0);
  if (!sum || amount <= 0) return into;
  let given = 0;
  for (const l of sorted) { const share = Math.floor((amount * l.price) / sum); into.set(l.slug, (into.get(l.slug) ?? 0) + share); given += share; }
  into.set(sorted[0].slug, (into.get(sorted[0].slug) ?? 0) + amount - given);
  return into;
}

function evaluate(offer: Offer, lines: Work[]): Result {
  const none: Result = { saving: 0, perLine: new Map(), used: [] };
  const pool = lines.filter((l) => eligible(offer, l)).sort(dearestFirst);
  const sum = pool.reduce((s, l) => s + l.price, 0);
  if (!pool.length || pool.length < offer.min_items || sum < offer.min_subtotal) return none;
  const perLine = new Map<string, number>();
  let used = pool;
  if (offer.kind === "percent") {
    for (const l of pool) perLine.set(l.slug, Math.floor((l.price * offer.value) / 100));
    const total = [...perLine.values()].reduce((s, v) => s + v, 0);
    if (offer.cap != null && total > offer.cap) { perLine.clear(); allocate(offer.cap, pool, perLine); }
  } else if (offer.kind === "flat") {
    if (offer.scope === "order") allocate(Math.min(offer.value, sum), pool, perLine);
    else for (const l of pool) perLine.set(l.slug, Math.min(offer.value, l.price));
  } else if (offer.kind === "bxgy") {
    const buy = offer.buy_qty ?? 0, get = offer.get_qty ?? 0, size = buy + get;
    if (!buy || !get) return none;
    used = pool.slice(0, Math.floor(pool.length / size) * size);
    used.forEach((l, i) => { if (i % size >= buy) perLine.set(l.slug, Math.floor((l.price * (offer.get_percent ?? 100)) / 100)); });
  } else {
    const qty = offer.bundle_qty ?? 0;
    if (!qty) return none;
    used = [];
    for (let i = 0; i + qty <= pool.length; i += qty) {
      const group = pool.slice(i, i + qty);
      const saving = group.reduce((s, l) => s + l.price, 0) - (offer.bundle_price ?? 0);
      if (saving > 0) { allocate(saving, group, perLine); used.push(...group); }
    }
  }
  const saving = [...perLine.values()].reduce((s, v) => s + v, 0);
  return saving > 0 ? { saving, perLine, used: used.map((l) => l.slug) } : none;
}

/** Labels a book shows: live offers that can apply to it (whole-order offers are not shown per book). */
export function offerBadges(line: CartLine, offers: Offer[], now: Date): string[] {
  return [...new Set(offers.filter((o) => o.scope !== "order" && isLive(o, now) && eligible(o, line))
    .sort((a, b) => Number(!!a.code) - Number(!!b.code)).map(offerBadge))];
}

const better = (a: { r: Result; o: Offer }, b: { r: Result; o: Offer }) =>
  a.r.saving - b.r.saving || a.o.priority - b.o.priority || Date.parse(a.o.created_at) - Date.parse(b.o.created_at);

export function priceCart(lines: CartLine[], offers: Offer[], ctx: { now: Date; code?: string | null; customer?: Customer }): PricedCart {
  const usable = offers.filter((o) => isLive(o, ctx.now) && customerOk(o, ctx.customer));
  const base: Work[] = lines.map(({ slug, price, categories, collections }) => ({ slug, price, categories, collections }));
  const discount = new Map<string, number>(lines.map((l) => [l.slug, 0]));
  const names = new Map<string, string[]>(lines.map((l) => [l.slug, []]));
  let applied: PricedCart["applied"] = [];
  const apply = (o: Offer, r: Result) => {
    for (const [slug, d] of r.perLine) { discount.set(slug, (discount.get(slug) ?? 0) + d); if (d > 0) names.get(slug)!.push(o.name); }
    applied.push({ id: o.id, name: o.name, code: o.code, saving: r.saving });
  };

  // Automatic offers: largest saving first; each book is used by at most one of them.
  let available = base;
  const remaining = usable.filter((o) => !o.code);
  for (;;) {
    const best = remaining.map((o) => ({ o, r: evaluate(o, available) })).filter((c) => c.r.saving > 0).sort((a, b) => better(b, a))[0];
    if (!best) break;
    apply(best.o, best.r);
    remaining.splice(remaining.indexOf(best.o), 1);
    available = available.filter((l) => !best.r.used.includes(l.slug));
  }

  let coupon: PricedCart["coupon"] = null;
  if (ctx.code && normaliseCode(ctx.code)) {
    const code = normaliseCode(ctx.code);
    const offer = usable.find((o) => o.code === code);
    if (!offer) coupon = { code, ok: false, message: "This code is not valid." };
    else if (offer.combinable) {
      const r = evaluate(offer, base.map((l) => ({ ...l, price: l.price - (discount.get(l.slug) ?? 0) })));
      if (r.saving > 0) { apply(offer, r); coupon = { code, ok: true, message: null }; }
      else coupon = { code, ok: false, message: "This code does not apply to these books." };
    } else {
      const r = evaluate(offer, base), automatic = applied.reduce((s, a) => s + a.saving, 0);
      if (r.saving === 0) coupon = { code, ok: false, message: "This code does not apply to these books." };
      else if (r.saving <= automatic) coupon = { code, ok: false, message: "A better offer is already applied." };
      else {
        applied = []; for (const l of lines) { discount.set(l.slug, 0); names.set(l.slug, []); }
        apply(offer, r); coupon = { code, ok: true, message: null };
      }
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.price, 0);
  // Never charge below Rs 1: trim the discount from the most expensive discounted lines.
  let excess = Math.min(subtotal, [...discount.values()].reduce((s, v) => s + v, 0)) - Math.max(0, subtotal - MIN_TOTAL);
  for (const l of [...base].sort(dearestFirst)) {
    if (excess <= 0) break;
    const cut = Math.min(excess, discount.get(l.slug) ?? 0);
    discount.set(l.slug, (discount.get(l.slug) ?? 0) - cut); excess -= cut;
  }
  const out = lines.map((l) => ({ slug: l.slug, regular: l.regular, base: l.price, price: l.price - (discount.get(l.slug) ?? 0), discount: discount.get(l.slug) ?? 0, offers: names.get(l.slug)! }));
  const total = out.reduce((s, l) => s + l.price, 0);
  return { lines: out, applied, subtotal, discount: subtotal - total, total, coupon };
}
