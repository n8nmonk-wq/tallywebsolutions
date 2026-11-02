import crypto from "node:crypto";
import { sql } from "./db";

export function clientKey(req: Request, scope: string) {
  const who = req.headers.get("x-vercel-forwarded-for") || "local";
  return crypto.createHash("sha256").update(`${scope}:${who}`).digest("hex");
}

/** Fixed-window counter in request_limits. Returns false once the window is exhausted. */
export async function consumeLimit(key: string, max: number, windowSeconds: number) {
  const rows = await sql`insert into request_limits (key, count, expires_at)
    values (${key}, 1, now() + make_interval(secs => ${windowSeconds})) on conflict (key) do update set
    count = case when request_limits.expires_at < now() then 1 else request_limits.count + 1 end,
    expires_at = case when request_limits.expires_at < now() then now() + make_interval(secs => ${windowSeconds}) else request_limits.expires_at end
    returning count` as { count: number }[];
  return rows[0].count <= max;
}
