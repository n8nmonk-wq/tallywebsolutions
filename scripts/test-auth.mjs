import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createIsolatedDatabase } from './isolated-db.mjs';

const { db, directory } = await createIsolatedDatabase();
globalThis.readingRoomDatabase = db;
Object.assign(process.env, { NODE_ENV: 'test', PGLITE_DATABASE_DIR: directory, DATABASE_URL: '',
  AUTH_SECRET: randomBytes(32).toString('hex'), NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
  RESEND_API_KEY: 'offline', MAIL_FROM: 'Test <test@example.com>' });
const mails = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  assert.equal(String(input), 'https://api.resend.com/emails', 'No live network is allowed.');
  mails.push(JSON.parse(options.body));
  return Response.json({ id: 'offline-email' });
};
const { getAuth } = await import('../src/lib/auth.ts');
const { POST: signupPost } = await import('../src/app/api/signup/route.ts');
const { POST: authPost } = await import('../src/app/api/auth/[...all]/route.ts');
const { localDatabase } = await import('../src/lib/local-db.ts');
const auth = getAuth();

const origin = 'http://localhost:3100';
const signup = (body, from = origin) => signupPost(new Request(`${origin}/api/signup`, {
  method: 'POST', headers: { origin: from, 'content-type': 'application/json' }, body: JSON.stringify(body),
}));
const signIn = (body, from = origin) => authPost(new Request(`${origin}/api/auth/sign-in/email`, {
  method: 'POST', headers: { origin: from, 'content-type': 'application/json' }, body: JSON.stringify(body),
}));
const person = { firstName: 'Riya', lastName: 'Shah', country: 'IN', phone: '98765 43210', email: 'reader@example.com', password: 'correct-horse-1' };

try {
  // Sign-up validation: cross-site requests, bad phone, bad email, bad name and duplicates are refused.
  assert.equal((await signup(person, 'https://attacker.example')).status, 403, 'Cross-site sign-up is refused.');
  assert.equal((await signup({ ...person, phone: '123' })).status, 400, 'A phone number invalid for its country is refused.');
  assert.equal((await signup({ ...person, email: 'not-an-email' })).status, 400, 'An invalid email is refused.');
  assert.equal((await signup({ ...person, firstName: 'R2D2' })).status, 400, 'A name with digits is refused.');
  assert.equal((await signup({ ...person, country: 'ZZ' })).status, 400, 'An unknown country is refused.');

  // Sign-up creates an unverified account and emails a verification link.
  assert.equal((await signup(person)).status, 200);
  assert.equal((await signup(person)).status, 200, 'A repeated sign-up answers the same way, so it does not reveal existing accounts.');
  assert.equal((await localDatabase().query('select count(*)::int n from "user" where email = $1', [person.email])).rows[0].n, 1, 'A repeated sign-up creates no second account.');
  const mail = mails.find(item => item.to === person.email);
  assert.ok(mail, 'A verification email is sent at sign-up.');

  // An unverified account cannot sign in.
  assert.equal((await signIn({ email: person.email, password: person.password })).status, 403, 'Unverified accounts cannot sign in.');

  // Following the verification link activates the account.
  const link = mail.text.match(/http:\/\/localhost:3100\/\S+/)[0];
  await auth.handler(new Request(link));

  // Email and password sign-in: wrong password refused, correct password creates a session.
  assert.equal((await signIn({ email: person.email, password: 'wrong-password' })).status, 401, 'A wrong password is refused.');
  const ok = await signIn({ email: person.email, password: person.password });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.equal(session.user.email, person.email);
  assert.equal(session.user.emailVerified, true);
  assert.equal(session.user.firstName, 'Riya');
  assert.equal(session.user.lastName, 'Shah');
  assert.equal(session.user.country, 'IN');
  assert.equal(session.user.phone, '+919876543210', 'The phone number is stored in international format.');

  // The password is never stored in plain text.
  const stored = JSON.stringify((await localDatabase().query('select * from account')).rows);
  assert.ok(!stored.includes(person.password), 'Passwords are hashed at rest.');

  console.log('Account checks passed: validated sign-up, verification before sign-in, email and password sign-in, hashed passwords, profile saved.');
} finally {
  globalThis.fetch = originalFetch;
  await localDatabase().close();
}
