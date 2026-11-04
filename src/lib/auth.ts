import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { PostgresDialect, type PostgresPool } from 'kysely';
import { Pool } from 'pg';
import { env, requireEnv } from './env';
import { localDatabase } from './local-db';
import { STORE, siteUrl } from './store';

function createAuthentication() {
  const pool = process.env.PGLITE_DATABASE_DIR && process.env.NODE_ENV !== 'production' ? {
    options: {},
    async connect() {
      return {
        async query(text: string, parameters?: readonly unknown[]) {
          const result = await localDatabase().query(text, parameters ? [...parameters] : []);
          return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length, command: text.trim().split(/\s/)[0].toUpperCase() };
        },
        release() {},
      };
    },
    async end() {},
  } : new Pool({ connectionString: requireEnv('DATABASE_URL', 'Configure the bookstore database.'), max: 5 });
  // Google sign-in is switched on only when both credentials are set.
  const google = env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET')
    ? { clientId: env('GOOGLE_CLIENT_ID')!, clientSecret: env('GOOGLE_CLIENT_SECRET')! } : null;
  return betterAuth({
    appName: STORE.name,
    baseURL: siteUrl(),
    secret: requireEnv('AUTH_SECRET', 'Configure a random authentication secret.'),
    // The isolated test pool supports queries only; auth does not use cursors.
    database: { dialect: new PostgresDialect({ pool: pool as PostgresPool }), type: 'postgres' },
    trustedOrigins: [siteUrl()],
    socialProviders: google ? { google } : undefined,
    session: { expiresIn: 60 * 60 * 24 * 7 },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 10 },
    // Sign-in is email and password. The one email we send is the verification link at sign-up,
    // so an account cannot claim purchases made with an address its owner never confirmed.
    emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 8, maxPasswordLength: 128 },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) => deliverAccountEmail(user.email,
        `Verify your ${STORE.name} account`,
        `Confirm your email to finish creating your account: ${url}\nThis link expires in one hour. Ignore this email if you did not sign up.`),
    },
    user: {
      additionalFields: {
        firstName: { type: 'string', required: false },
        lastName: { type: 'string', required: false },
        country: { type: 'string', required: false },
        phone: { type: 'string', required: false },
      },
    },
    plugins: [nextCookies()],
  });
}

// Outside production the email text is also printed to the server log, so sign-up works before
// the sending domain is verified. Production requires delivery.
export async function deliverAccountEmail(email: string, subject: string, text: string) {
  const local = process.env.NODE_ENV !== 'production';
  if (local) console.info(`[auth] Development email to ${email}: ${subject}\n${text}`);
  try {
    const key = requireEnv('RESEND_API_KEY', 'Transactional email must be configured.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: requireEnv('MAIL_FROM', 'Configure a verified sender.'), to: email, subject, text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Account email could not be delivered.');
  } catch {
    // The account row is already saved when this runs. Throwing here would turn a delivery
    // hiccup into a 500 and block a retry with "already exists", so log it and let the
    // customer use "Resend verification" on the sign-in page.
    console.error(local ? '[auth] Account email was not delivered; use the development text above.' : '[auth] Account email delivery failed; customer can resend.');
  }
}

let authentication: ReturnType<typeof createAuthentication> | undefined;
export function getAuth() { return authentication ??= createAuthentication(); }
