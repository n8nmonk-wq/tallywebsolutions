# Launch checklist

Run in order. Claude never writes to the production database; the commands marked "you run" are yours.

## 1. Back up and migrate the live database (you run)
1. Neon console → the production project → Branches → create a branch from `main` named `backup-YYYY-MM-DD`.
2. With the production connection string in a local file `.env.production.local` (never committed):
   `node --env-file=.env.production.local scripts/migrate.mjs --apply`
3. Status (read-only): `node --env-file=.env.production.local scripts/release-books.mjs <production-host-prefix>`

## 2. Release the books (you run)
1. Put the real "Researching Research for Ayurveda" PDF in `private/books/` and point its `file_url` at it
   (`private:<file name>`). The script refuses files under 1 KB.
2. `node --env-file=.env.production.local scripts/release-books.mjs <production-host-prefix> --apply`

## 3. Vercel environment (Production)
| Variable | Value |
|---|---|
| DATABASE_URL | production Neon connection string |
| AUTH_SECRET | `openssl rand -hex 32` |
| DOWNLOAD_SECRET | `openssl rand -hex 32` |
| CRON_SECRET | `openssl rand -hex 24` |
| ADMIN_TOKEN | `openssl rand -hex 24` (opens /admin without email) |
| ADMIN_EMAIL | the admin's email |
| COMMERCE_ENABLED | `true` |
| COMMERCE_POLICIES_APPROVED | `true` once seller, tax and refund terms are signed off |
| LEGAL_ENTITY_NAME | registered seller name |
| LEGAL_ENTITY_ADDRESS | registered address |
| SUPPORT_EMAIL | support address |
| NEXT_PUBLIC_SITE_URL | `https://<your domain>` |
| RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET | test keys until KYC clears |
| RESEND_API_KEY / MAIL_FROM | e.g. `Reading Room <books@www.your-domain.com>` |

Redeploy after changing variables.

## 4. Email
Resend → Domains → add `www.your-domain.com` → add the shown DNS records at the domain host → wait for "Verified".

## 5. Razorpay
Dashboard → Webhooks → `https://<your domain>/api/webhook`, secret = RAZORPAY_WEBHOOK_SECRET, events `payment_link.paid`, `payment.captured`, `refund.processed`.

## 6. Verify
1. `node scripts/check-live.mjs https://<your domain>` — every line PASS.
2. Buy one book at ₹1 in Razorpay test mode; confirm the order page, the download and the receipt email.
