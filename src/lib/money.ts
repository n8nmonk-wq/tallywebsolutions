/** All money is paise (integer). Never floats. */
// Whole rupees print without decimals; any paise (offers can leave some) are shown, so the shown total is the charged total.
export const rupees = (paise: number) =>
  "₹" + (paise / 100).toLocaleString("en-IN", paise % 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });

export function computeTotals(prices: number[]) {
  if (!prices.length || prices.length > 20 || prices.some(p => !Number.isSafeInteger(p) || p <= 0 || p > 2147483647)) throw new Error("Invalid prices");
  const subtotal = prices.reduce((a, b) => a + b, 0);
  if (subtotal > 2147483647) throw new Error("Order total exceeds supported amount");
  // shortcut: tax held at 0 until the CA confirms the e-book GST rate (PRD §4.8).
  // When confirmed, set TAX_BPS and the number flows to checkout, order page and email.
  const tax = 0;
  return { subtotal, tax, total: subtotal + tax };
}

export type Priced = { price_inr: number; sale_price_inr?: number | null;
  sale_starts_at?: string | Date | null; sale_ends_at?: string | Date | null };
export type CurrentPrice = { price: number; regular: number; onSale: boolean; saving: number };

const instant = (value: string | Date | null | undefined) =>
  value == null ? null : value instanceof Date ? value.getTime() : Date.parse(value);

/** The single source of the price a reader sees and is charged. Start inclusive, end exclusive. */
export function currentPrice(book: Priced, now: Date = new Date()): CurrentPrice {
  const regular = book.price_inr;
  const sale = book.sale_price_inr;
  const start = instant(book.sale_starts_at), end = instant(book.sale_ends_at), t = now.getTime();
  const valid = typeof sale === "number" && Number.isSafeInteger(sale) && sale > 0 && sale < regular
    && (start === null || (Number.isFinite(start) && start <= t))
    && (end === null || (Number.isFinite(end) && t < end));
  return valid ? { price: sale, regular, onSale: true, saving: regular - sale } : { price: regular, regular, onSale: false, saving: 0 };
}

export const percentOff = (p: CurrentPrice) => p.onSale ? Math.round((p.saving / p.regular) * 100) : 0;

export function orderSavings(order: { items: { price: number; list_price?: number }[] }) {
  return order.items.reduce((sum, item) => sum + (typeof item.list_price === "number" && item.list_price > item.price ? item.list_price - item.price : 0), 0);
}
