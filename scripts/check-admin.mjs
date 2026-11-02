import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const base = process.env.PREVIEW_URL || 'http://localhost:3100';
const token = process.env.ADMIN_TOKEN;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Admin checks must target the isolated preview.');
assert.match(token || '', /^[a-f0-9]{64}$/, 'Start the preview with ADMIN_TOKEN=<64 hex> and pass the same value here.');
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
try {
  await page.goto(`${base}/admin/login`);
  await page.getByLabel('Admin token').fill(token);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${base}/admin`);
  for (const [link, heading] of [['Orders', 'Orders'], ['Books', 'Books'], ['Categories', 'Categories'], ['Authors', 'Authors'],
    ['Collections', 'Collections'], ['Banners', 'Banners'], ['Homepage sections', 'Homepage sections'], ['Submissions', 'Submissions'], ['Delivery recovery', 'Delivery recovery']]) {
    await page.getByRole('navigation').getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  // Create a category, a draft book, set an offer, and confirm the store reflects it.
  await page.goto(`${base}/admin/categories`);
  await page.getByLabel('Name').first().fill('Poetry');
  await page.getByLabel('Slug').first().fill('poetry');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.locator('summary', { hasText: 'Poetry' })).toBeVisible();
  await page.goto(`${base}/admin/books`);
  await page.getByLabel('Title').first().fill('Admin check title');
  await page.getByLabel('Slug').first().fill('admin-check-title');
  await page.getByRole('button', { name: 'Create draft book' }).click();
  await expect(page.locator('summary', { hasText: 'Admin check title' })).toBeVisible();
  const demo = page.locator('details', { hasText: 'The Monsoon Ledger' });
  await demo.locator('summary').click();
  await demo.getByLabel('Sale price (₹)').fill('150');
  await demo.getByRole('button', { name: 'Save offer' }).click();
  await page.goto(`${base}/books/demo-the-monsoon-ledger`);
  await expect(page.getByText('₹150')).toBeVisible();
  // Schedule a banner that ended yesterday; it must not appear.
  await page.goto(`${base}/admin/platform/modules?type=banner`);
  await page.getByText('New module').click();
  await page.getByLabel('Title').first().fill('Expired banner check');
  await page.getByLabel('Status').first().selectOption('published');
  await page.getByLabel('Ends at (with timezone)').first().fill(new Date(Date.now() - 86400000).toISOString());
  await page.getByRole('button', { name: 'Save' }).first().click();
  await page.goto(base);
  await expect(page.getByText('Expired banner check')).toHaveCount(0);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
console.log('Admin browser check passed: sign-in, every section, category, draft book, offer reflected in store, expired banner hidden.');
