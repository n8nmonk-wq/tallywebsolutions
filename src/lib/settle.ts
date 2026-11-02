import { sql, type Order } from "./db";
import { fetchPaymentLink, findPaymentLink, validateLink, fetchOrderPayments } from "./razorpay";
import { fulfilOrder } from "./fulfil";

// Let callers distinguish provider failures from orders that remain unpaid.
export async function settleFromRazorpay(order: Order): Promise<boolean> {
  if (order.status === "refunded") return false;
  let ref = order.razorpay_link_id || order.razorpay_order_id;
  if (ref?.startsWith("nopay_")) return fulfilOrder(ref, null);
  if (!ref) {
    const attempts = await sql`select state, attempts from payment_attempts where order_id = ${order.id}` as { state: string; attempts: number }[];
    const link = await findPaymentLink(order.id);
    if (!link) {
      const attempt = attempts[0];
      // Only a rejected creation can be retried; an absent link cannot disprove a timed-out POST.
      if (attempt?.state === "failed" && attempt.attempts < 3) await sql`
        update payment_attempts set state = 'retryable', updated_at = now()
        where order_id = ${order.id} and state = 'failed' and attempts = ${attempt.attempts}
          and exists (select 1 from orders where id = ${order.id} and status = 'created'
            and razorpay_order_id is null and razorpay_link_id is null and payment_url is null and not is_dev)
      `;
      return false;
    }
    validateLink(link, order.id, order.total);
    const rows = await sql`
      update orders set razorpay_link_id = ${link.id}, razorpay_order_id = ${link.id}, payment_url = ${link.short_url}
      where id = ${order.id} and razorpay_order_id is null returning id
    ` as { id: string }[];
    if (!rows.length) return false;
    await sql`update payment_attempts set state = 'ready', updated_at = now() where order_id = ${order.id}`;
    ref = link.id;
  }
  if (ref.startsWith("plink_")) {
    const link = await fetchPaymentLink(ref);
    if (link.id !== ref || link.reference_id !== order.id || link.amount !== order.total || link.currency !== "INR")
      throw new Error("Provider link mismatch");
    if (link.status === "paid") return fulfilOrder(ref, order.razorpay_payment_id || null);
    if (link.status === "cancelled" || link.status === "expired")
      await sql`update orders set status = 'payment_failed' where id = ${order.id} and status = 'created'`;
    return false;
  }
  const payments = await fetchOrderPayments(ref);
  const paid = payments.find(p => p.status === "captured" || p.status === "refunded");
  return paid ? fulfilOrder(ref, paid.id) : false;
}
