"use client";

import { useState } from "react";
import { rupees } from "@/lib/money";

// One series, one hue (brand green, validated against the white surface); hover shows the day's numbers.
export default function RevenueChart({ daily }: { daily: { day: string; revenue: number; orders: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 960, H = 240, pad = { t: 12, r: 8, b: 26, l: 8 };
  const max = Math.max(1, ...daily.map((d) => d.revenue));
  const step = (W - pad.l - pad.r) / daily.length, bar = Math.max(2, step - 2);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  const every = Math.ceil(daily.length / 8);
  const h = hover === null ? null : daily[hover];
  return <figure className="relative">
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Revenue per day" onMouseLeave={() => setHover(null)}>
      {[0.5, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--color-line, #e4e5ee)" strokeDasharray="3 4" />)}
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#d2d4e0" />
      {daily.every((d) => !d.revenue) && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="14" fill="#4a4a58">No paid orders in this period</text>}
      {daily.map((d, i) => {
        const x = pad.l + i * step + 1, top = y(d.revenue), height = y(0) - top;
        return <g key={d.day}>
          {height > 0 && <path d={`M${x},${y(0)} V${top + Math.min(4, height)} q0,-4 4,-4 H${x + bar - 4} q4,0 4,4 V${y(0)} Z`} fill="#2e2e7e" opacity={hover === null || hover === i ? 1 : 0.45} />}
          <rect x={x - 1} y={pad.t} width={step} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
          {i % every === 0 && <text x={x + bar / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#4a4a58">{label(d.day)}</text>}
        </g>;
      })}
    </svg>
    {h && <div className="pointer-events-none absolute top-0 rounded-lg border border-line bg-white px-3 py-2 text-sm shadow"
      style={{ left: `min(calc(${((hover! + 0.5) / daily.length) * 100}% + 8px), calc(100% - 160px))` }}>
      <p className="font-medium">{label(h.day)}</p><p>{rupees(h.revenue)} · {h.orders} {h.orders === 1 ? "order" : "orders"}</p></div>}
    <details className="mt-2 text-sm"><summary className="cursor-pointer text-ink-soft">Show as table</summary>
      <table className="mt-2 w-full text-left"><thead><tr><th className="py-1">Day</th><th>Revenue</th><th>Orders</th></tr></thead>
        <tbody>{daily.filter((d) => d.orders).map((d) => <tr key={d.day} className="border-t border-line"><td className="py-1">{label(d.day)}</td><td>{rupees(d.revenue)}</td><td>{d.orders}</td></tr>)}</tbody></table></details>
  </figure>;
}
