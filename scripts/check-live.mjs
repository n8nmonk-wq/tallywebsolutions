// Read-only check of a deployed store. Never creates orders: the checkout probe sends an empty body
// without an idempotency key, which the route rejects (400) only after its configuration check passes.
//   node scripts/check-live.mjs https://<site>
import { pathToFileURL } from 'node:url';

const PAGES = ['/', '/search', '/cart', '/wishlist', '/login', '/publish', '/privacy', '/terms', '/refund-policy', '/delivery-policy'];

export async function runLiveChecks(base, fetchImpl = fetch) {
  const failures = [], passed = [];
  const origin = new URL(base).origin;
  const get = (p) => fetchImpl(new URL(p, origin), { redirect: 'manual' });
  const note = (ok, pass, fail) => (ok ? passed.push(pass) : failures.push(fail));
  for (const p of PAGES) {
    const r = await get(p);
    note(r.status === 200, `${p} returned 200`, `${p} returned ${r.status}`);
  }
  const suggest = await get('/api/search/suggest?q=ay');
  const found = suggest.ok ? (await suggest.json()).books?.length ?? 0 : 0;
  note(found > 0, 'search suggestions return books', `search suggestions returned no books (status ${suggest.status})`);
  const home = await (await get('/')).text();
  const slug = home.match(/href="\/books\/([a-z0-9][a-z0-9_-]*)"/)?.[1];
  if (!slug) failures.push('homepage links to no book page');
  else {
    const page = await (await get(`/books/${slug}`)).text();
    const sellable = /₹\d/.test(page) && /Buy now/.test(page);
    note(sellable, `/books/${slug} shows a price and Buy now`, `/books/${slug} has no price or Buy now (book not released or checkout off)`);
  }
  const admin = await (await get('/admin/login')).text();
  note(/Admin password/.test(admin), "admin password sign-in is available", "admin login has no password form: set ADMIN_PASSWORD in Vercel.");
  const probe = await fetchImpl(new URL('/api/checkout', origin), { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
  if (probe.status === 400) passed.push('checkout configuration is complete');
  else if (probe.status === 503) failures.push('Checkout is switched off or its configuration is incomplete (see docs/LAUNCH_CHECKLIST.md)');
  else failures.push(`checkout probe returned ${probe.status}`);
  return { failures, passed };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const base = process.argv[2];
  if (!base || !/^https:\/\//.test(base)) { console.error('Usage: node scripts/check-live.mjs https://<site>'); process.exit(1); }
  const { failures, passed } = await runLiveChecks(base);
  for (const p of passed) console.log(`PASS ${p}`);
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(failures.length ? 1 : 0);
}
