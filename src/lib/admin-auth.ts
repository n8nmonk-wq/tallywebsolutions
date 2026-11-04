import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { env } from './env';
import { sql } from './db';
import { consumeLimit, clientKey } from './rate-limit';

const COOKIE = 'admin_session';
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const same = (a: string, b: string) => crypto.timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));

// Admin sign-in needs both ADMIN_EMAIL and ADMIN_PASSWORD. ADMIN_TOKEN is accepted as the password for older deployments.
export const adminSignInConfigured = () => !!env('ADMIN_EMAIL') && !!(env('ADMIN_PASSWORD') || env('ADMIN_TOKEN'));

// Only a session created by signIn() counts. Reader accounts never grant admin.
// Cached per request: layouts, pages and actions all ask, but the session lookup runs once.
export const isAdmin = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const sessions = await sql`select 1 from admin_sessions where token_hash = ${hash(token)} and expires_at > now()`;
  return sessions.length > 0;
});

export async function signIn(email: string, password: string): Promise<boolean> {
  const expectedEmail = env('ADMIN_EMAIL');
  const expectedPassword = env('ADMIN_PASSWORD') || env('ADMIN_TOKEN');
  if (!expectedEmail || !expectedPassword || email.length > 256 || password.length > 256) return false;
  const requestHeaders = await headers();
  const allowed = await consumeLimit(clientKey(new Request('http://admin', { headers: requestHeaders }), 'admin'), 5, 3600);
  // Both comparisons always run, so a wrong email does not skip the password check.
  const emailMatches = same(email.trim().toLowerCase(), expectedEmail.toLowerCase());
  const passwordMatches = same(password, expectedPassword);
  if (!allowed || !(emailMatches && passwordMatches)) return false;
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
