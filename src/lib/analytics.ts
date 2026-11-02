import { sql } from "./db";

export type Range = { preset: string; from: string; to: string; days: number };
export type Kpis = { revenue: number; orders: number; aov: number; started: number; conversion: number; discount: number; refunds: number; refundCount: number };
export type Analytics = { kpis: Kpis; previous: Kpis; daily: { day: string; revenue: number; orders: number }[];
  topBooks: { slug: string; title: string; units: number; revenue: number }[]; offers: { id: string; name: string; uses: number; given: number; revenue: number }[] };

const PRESETS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const shift = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
const span = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;

/** India-time calendar days, inclusive. Bad or oversized custom ranges fall back to the last 30 days. */
export function parseRange(q: { range?: string; from?: string; to?: string }, today: string): Range {
  if (q.from && q.to && DAY.test(q.from) && DAY.test(q.to) && !isNaN(Date.parse(q.from)) && !isNaN(Date.parse(q.to))) {
    const days = span(q.from, q.to);
    if (days >= 1 && days <= 366) return { preset: "custom", from: q.from, to: q.to, days };
  }
  const preset = q.range && PRESETS[q.range] ? q.range : "30d", days = PRESETS[preset];
  return { preset, from: shift(today, 1 - days), to: today, days };
}

export const previousRange = (r: { from: string; days: number }) => ({ from: shift(r.from, -r.days), to: shift(r.from, -1), days: r.days });

// Real orders only: development checkouts and the demo catalogue's seeded orders never count.
async function kpis(from: string, to: string): Promise<Kpis> {
  const [k] = await sql`
    with real as (select * from orders where not is_dev and email <> 'demo@example.com'),
    paid as (select * from real where status in ('paid','fulfilled') and (coalesce(paid_at, created_at) at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date)
    select (select coalesce(sum(total),0)::int from paid) as revenue, (select count(*)::int from paid) as orders,
      (select count(*)::int from real where (created_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date) as started,
      (select coalesce(sum((i->>'discount')::int),0)::int from paid, jsonb_array_elements(items) i where i ? 'discount') as discount,
      (select coalesce(sum(total),0)::int from real where status = 'refunded' and (refunded_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date) as refunds,
      (select count(*)::int from real where status = 'refunded' and (refunded_at at time zone 'Asia/Kolkata')::date between ${from}::date and ${to}::date) as "refundCount"
  ` as Omit<Kpis, "aov" | "conversion">[];
  return { revenue: k.revenue, orders: k.orders, aov: k.orders ? Math.round(k.revenue / k.orders) : 0, started: k.started,
    conversion: k.started ? Math.round((k.orders / k.started) * 100) : 0, discount: k.discount, refunds: k.refunds, refundCount: k.refundCount };
}

export async function getAnalytics(r: Range): Promise<Analytics> {
  const prev = previousRange(r);
  const [current, previous, daily, topBooks, offers] = await Promise.all([
    kpis(r.from, r.to), kpis(prev.from, prev.to),
    sql`with paid as (select total, (coalesce(paid_at, created_at) at time zone 'Asia/Kolkata')::date as day from orders
          where not is_dev and email <> 'demo@example.com' and status in ('paid','fulfilled'))
        select to_char(d, 'YYYY-MM-DD') as day, coalesce(sum(p.total),0)::int as revenue, count(p.total)::int as orders
        from generate_series(${r.from}::date, ${r.to}::date, interval '1 day') d left join paid p on p.day = d::date group by d order by d` as unknown as Promise<Analytics["daily"]>,
    sql`select i->>'slug' as slug, max(i->>'title') as title, count(*)::int as units, sum((i->>'price')::int)::int as revenue
        from orders o, jsonb_array_elements(o.items) i
        where not o.is_dev and o.email <> 'demo@example.com' and o.status in ('paid','fulfilled')
          and (coalesce(o.paid_at, o.created_at) at time zone 'Asia/Kolkata')::date between ${r.from}::date and ${r.to}::date
        group by 1 order by revenue desc, units desc, slug limit 10` as unknown as Promise<Analytics["topBooks"]>,
    (async () => {
      try {
        return await sql`select f.id, f.name, count(*)::int as uses, sum(r.discount)::int as given, sum(o.total)::int as revenue
          from offer_redemptions r join offers f on f.id = r.offer_id join orders o on o.id = r.order_id
          where o.status in ('paid','fulfilled') and (coalesce(o.paid_at, o.created_at) at time zone 'Asia/Kolkata')::date between ${r.from}::date and ${r.to}::date
          group by f.id, f.name order by revenue desc` as Analytics["offers"];
      } catch (error) { if (/does not exist/.test(String((error as Error)?.message))) return []; throw error; }
    })(),
  ]);
  return { kpis: current, previous, daily, topBooks, offers };
}
