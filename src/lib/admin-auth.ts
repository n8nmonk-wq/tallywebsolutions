import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { env } from './env';
import { sql } from './db';
import { getReader } from './reader-auth';
import { consumeLimit, clientKey } from './rate-limit';

const COOKIE = 'admin_session';
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

// Cached per request: layouts, pages and actions all ask, but the session lookup runs once.
export const isAdmin = cache(async (_legacyToken?: string): Promise<boolean> => {
  const allowed = env('ADMIN_EMAIL');
  if (process.env.AUTH_SECRET) {
    const reader = await getReader();
    if (reader) {
      if (allowed && reader.email.toLowerCase() === allowed.toLowerCase()) {
        await sql`insert into user_roles(user_id,role) values(${reader.id},'admin') on conflict(user_id) do nothing`;
      }
      const roles = await sql`select role from user_roles where user_id=${reader.id}`;
      if (roles[0]?.role === 'admin') return true;
    }
  }
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const sessions = await sql`select 1 from admin_sessions where token_hash = ${hash(token)} and expires_at > now()`;
  return sessions.length > 0;
});

// ADMIN_PASSWORD is the sign-in secret; ADMIN_TOKEN is still accepted for existing deployments.
export const adminPasswordConfigured = () => !!(env('ADMIN_PASSWORD') || env('ADMIN_TOKEN'));

export async function signIn(password: string): Promise<boolean> {
  const expected = env('ADMIN_PASSWORD') || env('ADMIN_TOKEN');
  if (!expected || password.length > 256) return false;
  const requestHeaders = await headers();
  const allowed = await consumeLimit(clientKey(new Request('http://admin', { headers: requestHeaders }), 'admin'), 5, 3600);
  if (!allowed || !crypto.timingSafeEqual(Buffer.from(hash(password)), Buffer.from(hash(expected)))) return false;
  const session = crypto.randomBytes(32).toString('hex');
  await sql`insert into admin_sessions (token_hash, expires_at) values (${hash(session)}, now() + interval '7 days')`;
  (await cookies()).set(COOKIE, session, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 604800 });
  return true;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await sql`delete from admin_sessions where token_hash = ${hash(token)}`;
  jar.delete(COOKIE);
}
