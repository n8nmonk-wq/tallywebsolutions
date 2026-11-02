import crypto from "node:crypto";
import { env, flag, requireEnv } from "./env";
import type { Order } from "./db";

export function checkoutConfiguration() {
  if (!flag("COMMERCE_ENABLED")) throw new Error("Commerce is disabled");
  const dev = process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_CHECKOUT === "true";
  if (dev) return { dev: true, site: env("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000" };
  if (!flag("COMMERCE_POLICIES_APPROVED")) throw new Error("Commerce policies require signoff");
  for (const name of ["DATABASE_URL", "DOWNLOAD_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RESEND_API_KEY", "MAIL_FROM", "NEXT_PUBLIC_SITE_URL", "CRON_SECRET", "LEGAL_ENTITY_NAME", "LEGAL_ENTITY_ADDRESS", "SUPPORT_EMAIL", "AUTH_SECRET"])
    requireEnv(name, "Required before enabling commerce.");
  if (env("AUTH_SECRET")!.length < 32 || env("DOWNLOAD_SECRET")!.length < 32) throw new Error("Commerce requires strong authentication and download secrets");
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(env("SUPPORT_EMAIL")!)) throw new Error("Invalid support email");
  for (const name of ["LEGAL_ENTITY_NAME", "LEGAL_ENTITY_ADDRESS", "SUPPORT_EMAIL"]) {
    if (/placeholder|example\.(com|org|net)|awaiting confirmation|^your\b|\b(tbd|todo)\b/i.test(env(name)!)) throw new Error("Replace legal and support placeholders before enabling commerce");
  }
  const site = new URL(env("NEXT_PUBLIC_SITE_URL")!);
  if (site.protocol !== "https:" || site.username || site.password) throw new Error("Commerce requires an HTTPS site URL");
  return { dev: false, site: site.origin };
}
// For the admin dashboard: every reason checkout is off, by variable name only (never values).
export function checkoutProblems(): string[] {
  const problems: string[] = [];
  if (!flag("COMMERCE_ENABLED")) problems.push("COMMERCE_ENABLED must be exactly true");
  if (!flag("COMMERCE_POLICIES_APPROVED")) problems.push("COMMERCE_POLICIES_APPROVED must be exactly true");
  for (const name of ["DATABASE_URL", "DOWNLOAD_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RESEND_API_KEY", "MAIL_FROM", "NEXT_PUBLIC_SITE_URL", "CRON_SECRET", "LEGAL_ENTITY_NAME", "LEGAL_ENTITY_ADDRESS", "SUPPORT_EMAIL", "AUTH_SECRET"])
    if (!env(name)) problems.push(`${name} is missing or still a placeholder`);
  for (const name of ["AUTH_SECRET", "DOWNLOAD_SECRET"]) if (env(name) && env(name)!.length < 32) problems.push(`${name} must be at least 32 characters`);
  if (env("SUPPORT_EMAIL") && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(env("SUPPORT_EMAIL")!)) problems.push("SUPPORT_EMAIL is not a valid email");
  for (const name of ["LEGAL_ENTITY_NAME", "LEGAL_ENTITY_ADDRESS", "SUPPORT_EMAIL"])
    if (env(name) && /placeholder|example\.(com|org|net)|awaiting confirmation|^your\b|\b(tbd|todo)\b/i.test(env(name)!)) problems.push(`${name} still looks like a placeholder`);
  if (env("NEXT_PUBLIC_SITE_URL")) {
    try { if (new URL(env("NEXT_PUBLIC_SITE_URL")!).protocol !== "https:") problems.push("NEXT_PUBLIC_SITE_URL must start with https://"); }
    catch { problems.push("NEXT_PUBLIC_SITE_URL is not a valid URL"); }
  }
  return problems;
}
export class PaymentLinkCreationRejected extends Error {}

async function request(endpoint: string, body?: unknown) {
  const key = requireEnv("RAZORPAY_KEY_ID", "Required for payments.");
  const secret = requireEnv("RAZORPAY_KEY_SECRET", "Required for payments.");
  const res = await fetch(`https://api.razorpay.com/v1/${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64") },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    if (endpoint === "payment_links" && body && res.status === 400) {
      const data = await res.json().catch(() => null);
      if (data?.error?.code === "BAD_REQUEST_ERROR")
        throw new PaymentLinkCreationRejected("Payment link creation was rejected");
    }
    throw new Error(`Razorpay request failed (${res.status})`);
  }
  return res.json();
}
const providerId = (id: string, prefix: string) => {
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(id)) throw new Error("Invalid provider identifier");
  return encodeURIComponent(id);
};
export function verifyWebhook(rawBody: string, signature: string | null) {
  const secret = env("RAZORPAY_WEBHOOK_SECRET");
  if (!secret || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
export async function createRazorpayOrder(amountPaise: number, receipt: string) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error("Invalid payment amount");
  return request("orders", { amount: amountPaise, currency: "INR", receipt, notes: { receipt } }) as Promise<{ id: string; amount: number; currency: string }>;
}
export type PaymentLink = {
  id: string; short_url: string; reference_id: string; status: string;
  amount: number; amount_paid: number; currency: string;
  payments?: { payment_id?: string; id?: string; status?: string }[];
};
export type Payment = {
  id: string; order_id: string | null; amount: number; currency: string;
  status: string; captured: boolean; amount_refunded: number;
};
export async function createPaymentLink(opts: {
  amountPaise: number; orderId: string; name: string; email: string;
  phone: string; description: string; callbackUrl: string;
}): Promise<PaymentLink> {
  if (!Number.isSafeInteger(opts.amountPaise) || opts.amountPaise <= 0) throw new Error("Invalid payment amount");
  const link = await request("payment_links", {
    amount: opts.amountPaise, currency: "INR", accept_partial: false,
    reference_id: opts.orderId, description: opts.description,
    customer: { name: opts.name, email: opts.email, contact: opts.phone },
    notify: { sms: false, email: false }, reminder_enable: false,
    callback_url: opts.callbackUrl, callback_method: "get", notes: { order_id: opts.orderId },
  }) as PaymentLink;
  validateLink(link, opts.orderId, opts.amountPaise);
  return link;
}
export function validateLink(link: PaymentLink, orderId: string, total: number) {
  providerId(link.id, "plink");
  const url = new URL(link.short_url);
  if (link.reference_id !== orderId || link.amount !== total || link.currency !== "INR" ||
      url.protocol !== "https:" || url.hostname !== "rzp.io" || url.username || url.password)
    throw new Error("Payment link does not match persisted order");
}
export async function fetchPaymentLink(id: string): Promise<PaymentLink> {
  return request(`payment_links/${providerId(id, "plink")}`);
}
export async function findPaymentLink(orderId: string): Promise<PaymentLink | null> {
  const data = await request(`payment_links?reference_id=${encodeURIComponent(orderId)}`);
  if (!data || typeof data !== "object") throw new Error("Invalid payment link response");
  const candidates = typeof data.id === "string" ? [data] : data.payment_links;
  if (!Array.isArray(candidates)) throw new Error("Invalid payment link collection");
  if (data.count !== undefined && (!Number.isInteger(data.count) || data.count !== candidates.length))
    throw new Error("Incomplete payment link collection");
  if (candidates.some(link => !link || typeof link !== "object" || link.reference_id !== orderId))
    throw new Error("Payment link reference mismatch");
  if (candidates.length > 1) throw new Error("Multiple payment links for one order");
  return candidates[0] || null;
}
export async function fetchPayment(id: string): Promise<Payment> {
  const payment = await request(`payments/${providerId(id, "pay")}`) as Payment;
  if (payment.id !== id) throw new Error("Payment identifier mismatch");
  return payment;
}
export async function fetchOrderPayments(id: string): Promise<Payment[]> {
  const data = await request(`orders/${providerId(id, "order")}/payments`);
  if (!Array.isArray(data.items)) throw new Error("Invalid payments response");
  return data.items;
}
export async function verifyPaymentForOrder(order: Order, paymentId: string | null): Promise<Payment> {
  const ref = order.razorpay_link_id || order.razorpay_order_id;
  if (!ref) throw new Error("Order has no provider reference");
  let payment: Payment;
  if (ref.startsWith("plink_")) {
    const link = await fetchPaymentLink(ref);
    if (link.id !== ref || link.reference_id !== order.id || link.amount !== order.total ||
        link.currency !== "INR" || link.status !== "paid" || link.amount_paid !== order.total)
      throw new Error("Payment link is not fully paid for this order");
    const ids = (link.payments || []).map(p => p.payment_id || p.id).filter((id): id is string => !!id);
    const id = paymentId || ids[0];
    if (!id || !ids.includes(id)) throw new Error("Payment is not attached to this link");
    payment = await fetchPayment(id);
  } else {
    if (!paymentId) throw new Error("Payment identifier required");
    payment = await fetchPayment(paymentId);
    if (payment.order_id !== ref) throw new Error("Payment belongs to another order");
  }
  if (payment.amount !== order.total || payment.currency !== "INR" ||
      !Number.isSafeInteger(payment.amount_refunded) || payment.amount_refunded < 0 ||
      payment.amount_refunded > payment.amount ||
      (payment.status !== "captured" && payment.status !== "refunded") ||
      payment.captured !== true ||
      (order.razorpay_payment_id && order.razorpay_payment_id !== payment.id))
    throw new Error("Payment does not match order");
  return payment;
}
