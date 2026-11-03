import { spawnSync } from 'node:child_process';

const checks = ['scripts/test-token.mjs', 'scripts/test-pdf-stamp.mjs', 'scripts/test-validate.mjs', 'scripts/test-csv.mjs', 'scripts/test-pricing.mjs',
  'scripts/test-access.mjs', 'src/components/reading-room.test.cjs', 'scripts/test-commerce.mjs',
  'scripts/test-commerce-routes.mjs', 'scripts/test-commerce-db.mjs', 'scripts/test-publishing.mjs',
  'scripts/test-publishing-db.mjs', 'scripts/test-publishing-routes.mjs', 'scripts/test-auth.mjs', 'scripts/test-recovery.mjs', 'scripts/test-release-books.mjs', 'scripts/test-check-live.mjs', 'scripts/test-demo-covers.mjs', 'scripts/test-admin-sale.mjs', 'scripts/test-migrations.mjs', 'scripts/test-marketplace-db.mjs', 'scripts/test-store-data.mjs', 'scripts/test-demo-catalogue.mjs', 'scripts/test-admin-catalogue.mjs', 'scripts/test-admin-orders.mjs', 'scripts/test-home.mjs', 'scripts/test-listing.mjs', 'scripts/test-search.mjs', 'scripts/test-wishlist.mjs', 'scripts/test-cart-summary.mjs', 'scripts/test-offers.mjs', 'scripts/test-offers-admin.mjs', 'scripts/test-analytics.mjs'];
for (const check of checks) {
  console.log(`\nChecking ${check}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', check], {
    stdio: 'inherit', env: { ...process.env, DATABASE_URL: '', RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '',
      RESEND_API_KEY: '', BLOB_READ_WRITE_TOKEN: '', COMMERCE_ENABLED: 'false' },
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log('\nAll offline regression suites passed. No production credentials or services were used.');
