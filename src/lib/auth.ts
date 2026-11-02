import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { PostgresDialect, type PostgresPool } from 'kysely';
import { Pool } from 'pg';
import { requireEnv } from './env';
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
  return betterAuth({
    appName: STORE.name,
    baseURL: siteUrl(),
    secret: requireEnv('AUTH_SECRET', 'Configure a random authentication secret.'),
    // The isolated test pool supports queries only; auth does not use cursors.
    database: { dialect: new PostgresDialect({ pool: pool as PostgresPool }), type: 'postgres' },
    trustedOrigins: [siteUrl()],
    session: { expiresIn: 60 * 60 * 24 * 7 },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 10 },
    plugins: [magicLink({
      expiresIn: 15 * 60,
      storeToken: 'hashed',
      sendMagicLink: ({ email, url }) => deliverMagicLink(email, url),
    }), nextCookies()],
  });
}

// Outside production the link is also printed to the server log, so local sign-in
// works before the sending domain is verified. Production still requires delivery.
export async function deliverMagicLink(email: string, url: string) {
  const local = process.env.NODE_ENV !== 'production';
  if (local) console.info(`[auth] Development sign-in link for ${email}: ${url}`);
  try {
    const key = requireEnv('RESEND_API_KEY', 'Transactional email must be configured.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: requireEnv('MAIL_FROM', 'Configure a verified sender.'), to: email,
        subject: `Your ${STORE.name} sign-in link`,
        text: `Sign in to your library and publishing workspace: ${url}\nThis link expires in 15 minutes. Ignore this email if you did not request it.` }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Sign-in email could not be delivered.');
  } catch (error) {
    if (!local) throw error;
    console.warn('[auth] Sign-in email was not delivered; use the development link above.');
  }
}

let authentication: ReturnType<typeof createAuthentication> | undefined;
export function getAuth() { return authentication ??= createAuthentication(); }
