/**
 * Set every active title to a test price, or restore the real ones.
 *
 *   node --env-file=.env.local scripts/set-price.mjs 1        set all to Rs 1
 *   node --env-file=.env.local scripts/set-price.mjs restore  put the real prices back
 *
 * Prices are stored in paise. The real values are kept in books.facts under
 * `_real_price_inr` so a restore does not depend on remembering them.
 */
import { neon } from "@neondatabase/serverless";

const DB = process.env.DATABASE_URL;
if (!DB || DB.includes("user:password@")) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const sql = neon(DB);
const arg = process.argv[2];

if (arg === "restore") {
  const rows = await sql`
    update books
       set price_inr = (facts->>'_real_price_inr')::int,
           facts = facts - '_real_price_inr'
     where facts ? '_real_price_inr'
    returning slug, price_inr
  `;
  if (!rows.length) console.log("Nothing to restore — no saved prices found.");
  for (const r of rows) console.log(`restored ${r.slug} -> Rs ${r.price_inr / 100}`);
} else {
  const rupees = Number(arg);
  if (!Number.isFinite(rupees) || rupees <= 0) {
    console.error('Pass a rupee amount, e.g. "1", or "restore".');
    process.exit(1);
  }
  // Save the real price once; a second run must not overwrite it with 1.
  const rows = await sql`
    update books
       set facts = case
             when facts ? '_real_price_inr' then facts
             else facts || jsonb_build_object('_real_price_inr', price_inr::text)
           end,
           price_inr = ${Math.round(rupees * 100)}
     where active = true
    returning slug, price_inr, facts->>'_real_price_inr' as saved
  `;
  for (const r of rows) {
    console.log(`${r.slug} -> Rs ${r.price_inr / 100}  (real price saved: Rs ${Number(r.saved) / 100})`);
  }
}
