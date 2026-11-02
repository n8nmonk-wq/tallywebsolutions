import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { getAuth } from './auth';
import { sql, type Order } from './db';
import { ownsOrder, sameOrigin } from './access-policy';

const GUEST_COOKIE = 'reading_room_guest';
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export function checkOrigin(req: Request) { return sameOrigin(req.headers.get('origin'), req.url); }

export async function getReader(): Promise<{ id: string; email: string; name: string } | null> {
  if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL && !process.env.PGLITE_DATABASE_DIR) return null;
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.emailVerified ? { id: session.user.id, email: session.user.email, name: session.user.name } : null;
}

export async function grantGuestOrder(orderId: string) {
  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value;
  const token = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : crypto.randomBytes(32).toString('hex');
  await sql`insert into guest_order_grants (token_hash, order_id, expires_at)
    values (${hash(token)}, ${orderId}, now() + interval '3 days')
    on conflict (token_hash, order_id) do update set expires_at = excluded.expires_at`;
  jar.set(GUEST_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 259200 });
}

export async function canAccessOrder(order: Order) {
  const reader = await getReader();
  if (ownsOrder(reader?.email ?? null, order.email)) return true;
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const grants = await sql`select 1 from guest_order_grants where token_hash = ${hash(token)}
    and order_id = ${order.id} and expires_at > now()`;
  return grants.length > 0;
}
