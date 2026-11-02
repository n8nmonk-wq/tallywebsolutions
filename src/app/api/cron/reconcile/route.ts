import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { sql, type Order } from "@/lib/db";
import { settleFromRazorpay } from "@/lib/settle";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export async function GET(req: Request) {
  const secret = env("CRON_SECRET");
  const expected = secret ? Buffer.from(`Bearer ${secret}`) : null;
  const actual = Buffer.from(req.headers.get("authorization") || "");
  if (!expected || actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Include older paid/fulfilled orders: missed refunds must revoke access too.
  const orders = await sql`
    select o.* from orders o
    where o.status in ('created','payment_failed','paid','fulfilled') and not o.is_dev
      and o.created_at < now() - interval '2 minutes'
      and (o.razorpay_order_id is not null or exists (select 1 from payment_attempts p where p.order_id = o.id))
    order by o.commerce_checked_at nulls first, o.created_at limit 50
  ` as Order[];
  let recovered = 0, failed = 0;
  for (const order of orders) {
    try { if (await settleFromRazorpay(order)) recovered++; }
    catch (error) { failed++; console.error("[reconcile]", order.id, error); }
    finally { await sql`update orders set commerce_checked_at = now() where id = ${order.id}`; }
  }
  return NextResponse.json({ checked: orders.length, recovered, failed }, { status: failed ? 503 : 200 });
}
