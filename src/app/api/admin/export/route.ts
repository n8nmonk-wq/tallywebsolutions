import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * Orders as CSV. Excel opens CSV natively, so a real .xlsx writer would be a
 * dependency for no gain.
 */
const COLUMNS = [
  "order_id", "name", "email", "phone", "book", "amount_inr", "status",
  "invoice_no", "razorpay_payment_id", "created_at", "paid_at",
];

/**
 * Excel treats a leading =, +, - or @ as a formula, so a crafted name field
 * could execute on the operator's machine when they open the export.
 * Prefixing with an apostrophe neutralises it.
 */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const rows = (await sql`
    select id, name, email, phone, items, total, status, invoice_no,
           razorpay_payment_id, created_at, paid_at
    from orders
    order by created_at desc
  `) as Record<string, any>[];

  const body = [
    COLUMNS.join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.name,
        r.email,
        r.phone,
        (r.items || []).map((i: { title: string }) => i.title).join(" | "),
        (r.total / 100).toFixed(2),
        r.status,
        r.invoice_no,
        r.razorpay_payment_id,
        r.created_at,
        r.paid_at,
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("\uFEFF" + body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orders-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
