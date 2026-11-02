/**
 * With no webhook, three paths can fulfil an order: the order page, the cron,
 * and (later) the webhook. All three call fulfilOrder, so the guard below is
 * the only thing preventing a double email and a double transition.
 * Needs DATABASE_URL; skips without one.
 */
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

const DB = process.env.DATABASE_URL;
if (!DB || DB.includes("user:password@") || /@host\//.test(DB)) {
  console.log("skipped: no DATABASE_URL");
  process.exit(0);
}

const sql = neon(DB);
const id = "test_settle_" + Date.now();
const link = "plink_test_" + Date.now();

const claim = () => sql`
  update orders set status = 'paid', paid_at = now()
  where razorpay_link_id = ${link} and status = 'created'
  returning id
`;

try {
  await sql`
    insert into orders (id, email, items, subtotal, tax, total, status,
                        razorpay_order_id, razorpay_link_id)
    values (${id}, 'settle@example.com', '[]'::jsonb, 100, 0, 100, 'created',
            ${link}, ${link})
  `;

  // Order page and cron racing on the same order.
  const [a, b] = await Promise.all([claim(), claim()]);
  const winners = [a, b].filter((r) => r.length === 1);
  assert.equal(winners.length, 1, "exactly one caller may transition the order");

  assert.equal((await claim()).length, 0, "a later webhook must be a no-op");

  const [row] = await sql`select status from orders where id = ${id}`;
  assert.equal(row.status, "paid");

  console.log("settlement idempotency passed (concurrent callers)");
} finally {
  await sql`delete from orders where id = ${id}`;
}
