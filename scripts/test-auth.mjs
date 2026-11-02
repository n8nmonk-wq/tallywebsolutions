import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createIsolatedDatabase } from './isolated-db.mjs';

const { db, directory } = await createIsolatedDatabase();
globalThis.readingRoomDatabase = db;
Object.assign(process.env, { NODE_ENV: 'test', PGLITE_DATABASE_DIR: directory, DATABASE_URL: '',
  AUTH_SECRET: randomBytes(32).toString('hex'), NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
  RESEND_API_KEY: 'offline', MAIL_FROM: 'Test <test@example.com>' });
let link;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  assert.equal(String(input), 'https://api.resend.com/emails', 'No live network is allowed.');
  link = JSON.parse(options.body).text.match(/http:\/\/localhost:3100\/\S+/)[0];
  return Response.json({ id: 'offline-email' });
};
const { getAuth } = await import('../src/lib/auth.ts');
const { localDatabase } = await import('../src/lib/local-db.ts');
const auth = getAuth();
const { POST } = await import('../src/app/api/auth/[...all]/route.ts');
const signIn = (origin = 'http://localhost:3100') => POST(new Request('http://localhost:3100/api/auth/sign-in/magic-link', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'reader@example.com', callbackURL: '/library' }),
}));
try {
  assert.equal((await signIn('https://attacker.example')).status, 403);
  assert.equal((await signIn()).status, 200);
  assert.ok(link);
  const token = new URL(link).searchParams.get('token');
  const records = (await localDatabase().query('select * from verification')).rows;
  assert.ok(records.length);
  assert.ok(!JSON.stringify(records).includes(token), 'Magic-link credentials must be hashed at rest.');
  const responses = await Promise.all([auth.handler(new Request(link)), auth.handler(new Request(link))]);
  const success = responses.filter(response => response.headers.get('set-cookie')?.includes('session_token'));
  assert.equal(success.length, 1, 'A magic link can create only one session.');
  const cookie = success[0].headers.get('set-cookie').split(';')[0];
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.equal(session.user.email, 'reader@example.com');
  assert.equal(session.user.emailVerified, true);
  const noSession = await auth.api.getSession({ headers: new Headers({ cookie: cookie + 'tampered' }) });
  assert.equal(noSession, null);
  const signOut = await auth.handler(new Request('http://localhost:3100/api/auth/sign-out', {
    method: 'POST', headers: { cookie, origin: 'http://localhost:3100', 'content-type': 'application/json' }, body: '{}',
  }));
  assert.equal(signOut.status, 200);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
  console.log('Actual authentication: CSRF, hashed single-use magic links, verified sessions, tampering, and revocation passed.');
} finally {
  globalThis.fetch = originalFetch;
  await localDatabase().close();
}
