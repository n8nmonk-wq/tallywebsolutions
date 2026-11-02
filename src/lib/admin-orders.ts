import { sql } from "./db";

export type OrderFilter = { q: string; status: string; from: string; to: string; page: number };
export type AdminOrderRow = { id: string; name: string | null; email: string; total: number; status: string; created_at: string;
  items: { title: string; price: number; list_price?: number }[] };
const STATUSES = ["created", "paid", "fulfilled", "payment_failed", "refunded"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const date = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";

export function parseOrderFilter(params: Record<string, string | string[] | undefined>): OrderFilter {
  const page = Number(one(params.page));
  return { q: one(params.q).trim().toLowerCase().slice(0, 120), status: STATUSES.includes(one(params.status)) ? one(params.status) : "",
    from: date(one(params.from)), to: date(one(params.to)), page: Number.isSafeInteger(page) && page > 0 ? page : 1 };
}

// Search is a literal substring match on id, email or name; LIKE wildcards in input are escaped.
export async function listOrders(f: OrderFilter, pageSize = 25) {
  const like = f.q ? `%${f.q.replace(/[\\%_]/g, (c) => "\\" + c)}%` : null;
  const status = f.status || null, from = f.from || null, to = f.to || null;
  // The neon tagged template cannot nest fragments, so the same predicate appears in both queries.
  const rows = await sql`select id,name,email,total,status,created_at::text,items from orders
    where (${like}::text is null or lower(id) like ${like} or lower(email) like ${like} or lower(coalesce(name,'')) like ${like})
      and (${status}::text is null or status = ${status}) and (${from}::date is null or created_at >= ${from}::date)
      and (${to}::date is null or created_at < ${to}::date + 1)
    order by created_at desc limit ${pageSize} offset ${(f.page - 1) * pageSize}` as AdminOrderRow[];
  const counted = await sql`select count(*)::int as n from orders
    where (${like}::text is null or lower(id) like ${like} or lower(email) like ${like} or lower(coalesce(name,'')) like ${like})
      and (${status}::text is null or status = ${status}) and (${from}::date is null or created_at >= ${from}::date)
      and (${to}::date is null or created_at < ${to}::date + 1)` as { n: number }[];
  return { rows, total: counted[0].n };
}
