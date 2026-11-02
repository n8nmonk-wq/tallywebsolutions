// Offline: sign-in link delivery falls back to the server log only outside production.
import assert from 'node:assert/strict';

Object.assign(process.env, { RESEND_API_KEY: 'offline', MAIL_FROM: 'Test <test@example.com>', NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' });
const { deliverMagicLink } = await import('../src/lib/auth.ts');
const url = 'http://localhost:3100/api/auth/magic-link/verify?token=offline';
let status = 403;
globalThis.fetch = async (input) => {
  assert.equal(String(input), 'https://api.resend.com/emails', 'No live network is allowed.');
  return new Response('{}', { status });
};
const logged = [];
const info = console.info, warn = console.warn;
console.info = (...args) => logged.push(args.join(' '));
console.warn = () => {};
try {
  process.env.NODE_ENV = 'development';
  await deliverMagicLink('reader@example.com', url);
  assert.ok(logged.some(line => line.includes(url)), 'development prints the link');
  delete process.env.RESEND_API_KEY;
  await deliverMagicLink('reader@example.com', url);

  process.env.NODE_ENV = 'production';
  process.env.RESEND_API_KEY = 'offline';
  logged.length = 0;
  await assert.rejects(deliverMagicLink('reader@example.com', url), /could not be delivered/);
  assert.equal(logged.length, 0, 'production never prints sign-in links');
  status = 200;
  await deliverMagicLink('reader@example.com', url);
} finally {
  console.info = info; console.warn = warn;
}
console.log('Magic link delivery: development log fallback, production requires delivery, links never logged in production.');
