/**
 * The guard that stops a retried webhook sending a second email and
 * double-transitioning an order. Needs a real DATABASE_URL; skips without one.
 *
 *   node --env-file=.env.local scripts/test-fulfil.mjs
 */
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

const DB = process.env.DATABASE_URL;
if (!DB || DB.includes("user:password@") || /@host\//.test(DB)) {
  console.log("skipped: no DATABASE_URL (set one to run this)");
  process.exit(0);
}

const sql = neon(DB);
const id = "test_" + Date.now();
const rzp = "rzp_test_" + Date.now();

const claim = () => sql`
  update orders set status = 'paid', paid_at = now()
  where razorpay_order_id = ${rzp} and status = 'created'
  returning id
`;

try {
  await sql`
    insert into orders (id, email, items, subtotal, tax, total, status, razorpay_order_id)
    values (${id}, 'test@example.com', '[]'::jsonb, 100, 0, 100, 'created', ${rzp})
  `;

  const first = await claim();
  assert.equal(first.length, 1, "first webhook must transition the order");

  const replay = await claim();
  assert.equal(replay.length, 0, "replayed webhook must be a no-op");

  const third = await claim();
  assert.equal(third.length, 0, "further replays must stay no-ops");

  const [row] = await sql`select status from orders where id = ${id}`;
  assert.equal(row.status, "paid");

  console.log("fulfilment idempotency passed");
} finally {
  await sql`delete from orders where id = ${id}`;
}
