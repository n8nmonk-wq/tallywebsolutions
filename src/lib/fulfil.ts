import crypto from "node:crypto";
import { sql, type Order } from "./db";
import { confirmationPayload, sendEmail, type EmailPayload } from "./email";
import { verifyPaymentForOrder } from "./razorpay";

export async function retryOrderEmail(orderId: string): Promise<boolean> {
  // Resend keys expire after 24 hours; older uncertain sends need manual review.
  await sql`
    update email_delivery set state = 'manual'
    where order_id = ${orderId} and state in ('pending','sending')
      and (attempts >= 8 or first_attempt_at < now() - interval '23 hours')
      and (lease_until is null or lease_until < now())
  `;
  const claim = crypto.randomUUID();
  const rows = await sql`
    update email_delivery e set state = 'sending', attempts = attempts + 1,
      first_attempt_at = coalesce(first_attempt_at, now()), lease_until = now() + interval '2 minutes',
      claim_id = ${claim}
    where e.order_id = ${orderId} and e.state in ('pending','sending') and e.attempts < 8
      and e.next_attempt_at <= now() and (e.lease_until is null or e.lease_until < now())
      and (e.first_attempt_at is null or e.first_attempt_at > now() - interval '23 hours')
      and exists (select 1 from orders o where o.id = e.order_id and o.status = 'fulfilled' and not o.is_dev)
    returning e.payload
  ` as { payload: EmailPayload }[];
  if (!rows.length) return false;
  try {
    const providerId = await sendEmail(rows[0].payload, `order-confirmation/${orderId}`);
    await sql`
      update email_delivery set state = 'sent', provider_id = ${providerId},
        sent_at = now(), lease_until = null, claim_id = null
      where order_id = ${orderId} and claim_id = ${claim} and state = 'sending'
    `;
    return true;
  } catch (error) {
    await sql`
      update email_delivery set state = case when attempts >= 8 then 'manual' else 'pending' end,
        last_error = 'Email delivery failed', lease_until = null, claim_id = null,
        next_attempt_at = now() + interval '5 minutes' * attempts
      where order_id = ${orderId} and claim_id = ${claim} and state = 'sending'
    `;
    throw error;
  }
}
async function revokeOrder(orderId: string, paymentId: string): Promise<boolean> {
  const rows = await sql`
    with refunded as (
      update orders set status = 'refunded', refunded_at = coalesce(refunded_at, now()),
        razorpay_payment_id = coalesce(razorpay_payment_id, ${paymentId})
      where id = ${orderId} and (razorpay_payment_id is null or razorpay_payment_id = ${paymentId})
      returning id
    ), revoked as (
      update downloads set revoked_at = now() where order_id in (select id from refunded)
    ), cancelled as (
      update email_delivery set state = 'cancelled', lease_until = null, claim_id = null
      where order_id in (select id from refunded) and state <> 'sent'
    )
    select id from refunded
  ` as { id: string }[];
  return rows.length > 0;
}
export async function fulfilOrder(ref: string, paymentId: string | null): Promise<boolean> {
  const orders = await sql`
    select * from orders where razorpay_order_id = ${ref} or razorpay_link_id = ${ref}
  ` as (Order & { is_dev?: boolean })[];
  const order = orders[0];
  if (!order || order.status === "refunded") return false;
  const dev = order.is_dev === true && ref === `nopay_${order.id}` &&
    process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_CHECKOUT === "true";
  if (ref.startsWith("nopay_") && !dev) throw new Error("Simulated payment is not authorized");
  if (!dev) {
    const payment = await verifyPaymentForOrder(order, paymentId);
    paymentId = payment.id;
    if (payment.amount_refunded > 0) return revokeOrder(order.id, payment.id);
  }
  if (!order.items.length || order.items.length > 20) throw new Error("Invalid persisted order items");
  const payload = dev ? null : confirmationPayload(
    { ...order, paid_at: order.paid_at || order.created_at }, process.env.NEXT_PUBLIC_SITE_URL!
  );
  const rows = await sql`
    with paid as (
      update orders set status = 'fulfilled', razorpay_payment_id = coalesce(razorpay_payment_id, ${paymentId}),
        paid_at = coalesce(paid_at, now())
      where id = ${order.id} and status in ('created','payment_failed','paid','fulfilled')
        and (razorpay_payment_id is null or razorpay_payment_id = ${paymentId})
      returning id, items
    ), entitlements as (
      insert into downloads (order_id, book_slug)
      select p.id, item->>'slug' from paid p cross join lateral jsonb_array_elements(p.items) item
      on conflict (order_id, book_slug) do nothing
      returning order_id
    ), mail as (
      insert into email_delivery (order_id, payload)
      select id, ${JSON.stringify(payload)}::jsonb from paid where ${!dev}
      on conflict (order_id) do nothing
    )
    select id from paid
  ` as { id: string }[];
  if (!rows.length) return false;
  // Redemptions count toward offer limits; repeated fulfilment is a no-op.
  if (Array.isArray(order.offers) && order.offers.length) await sql`
    insert into offer_redemptions (offer_id, order_id, email, discount)
    select x->>'id', ${order.id}, ${order.email}, (x->>'saving')::int from jsonb_array_elements(${JSON.stringify(order.offers)}::jsonb) x
    on conflict (offer_id, order_id) do nothing
  `;
  if (!dev) await retryOrderEmail(order.id);
  return true;
}
