import { NextResponse } from "next/server";
import { sql, type Order } from "@/lib/db";
import { verifyWebhook } from "@/lib/razorpay";
import { fulfilOrder } from "@/lib/fulfil";
import { settleFromRazorpay } from "@/lib/settle";
import { readLimitedBody, PublishingError } from "@/lib/submissions";

export const runtime = "nodejs";
export async function POST(req: Request) {
  let raw: string;
  try { raw = new TextDecoder().decode(await readLimitedBody(req, 262144)); }
  catch (error) {
    if (error instanceof PublishingError && error.status === 413)
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  if (!verifyWebhook(raw, req.headers.get("x-razorpay-signature")))
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  let event;
  try {
    event = JSON.parse(raw);
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Invalid event");
  } catch { return NextResponse.json({ error: "Invalid payload." }, { status: 400 }); }
  try {
    const type = event.event;
    const link = event.payload?.payment_link?.entity;
    const payment = event.payload?.payment?.entity;
    const refund = event.payload?.refund?.entity;
    if (type === "payment_link.paid" || type === "payment_link.cancelled" || type === "payment_link.expired") {
      if (typeof link?.id !== "string" || typeof link?.reference_id !== "string")
        return NextResponse.json({ error: "Missing link reference." }, { status: 400 });
      const rows = await sql`select * from orders where id = ${link.reference_id}` as Order[];
      if (!rows.length) return NextResponse.json({ error: "Order not yet available." }, { status: 503 });
      await settleFromRazorpay(rows[0]);
    } else if (type === "payment.captured" || type === "payment.refunded" || type === "refund.processed") {
      const id = type === "refund.processed" ? refund?.payment_id : payment?.id;
      if (typeof id !== "string" || !/^pay_[A-Za-z0-9]+$/.test(id))
        return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });
      const rows = await sql`
        select * from orders where razorpay_payment_id = ${id}
          or razorpay_order_id = ${typeof payment?.order_id === "string" ? payment.order_id : null}
      ` as Order[];
      if (!rows.length) return NextResponse.json({ error: "Payment association pending." }, { status: 503 });
      const order = rows[0];
      await fulfilOrder(order.razorpay_link_id || order.razorpay_order_id!, id);
    }
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[webhook] recovery required");
    return NextResponse.json({ error: "Payment processing will be retried." }, { status: 503 });
  }
}

