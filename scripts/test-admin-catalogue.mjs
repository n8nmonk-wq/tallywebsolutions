import assert from 'node:assert/strict';
import { load } from './test-commerce.mjs';

const a = load('src/lib/admin-catalogue.ts', { '@/lib/submissions': { PublishingError: class extends Error { constructor(m, s = 400) { super(m); this.status = s; } } } });
const form = entries => { const f = new FormData(); for (const [k, v] of Object.entries(entries)) f.set(k, v); return f; };

assert.deepEqual(a.parseSale(form({ sale_price: '' }), 29900), { sale_price_inr: null, sale_starts_at: null, sale_ends_at: null });
assert.deepEqual(a.parseSale(form({ sale_price: '252', sale_starts_at: '2026-10-18T00:00', sale_ends_at: '2026-10-20T00:00' }), 29900),
  { sale_price_inr: 25200, sale_starts_at: '2026-10-18T00:00:00+05:30', sale_ends_at: '2026-10-20T00:00:00+05:30' });
for (const bad of ['299', '300', '0', '-5', 'abc', '1.234'])
  assert.throws(() => a.parseSale(form({ sale_price: bad }), 29900), /sale price/i, bad);
assert.throws(() => a.parseSale(form({ sale_price: '100', sale_starts_at: '2026-10-20T00:00', sale_ends_at: '2026-10-18T00:00' }), 29900), /end/i);

assert.deepEqual(a.parseCategory(form({ slug: 'science', name: 'Science', colour: '#2563EB', sort: '3', status: 'published' })),
  { slug: 'science', name: 'Science', parent_slug: null, image_url: null, colour: '#2563EB', sort: 3, status: 'published' });
assert.throws(() => a.parseCategory(form({ slug: 'Bad Slug', name: 'x' })), /slug/i);
assert.throws(() => a.parseCategory(form({ slug: 'ok', name: 'x', colour: 'red' })), /colour/i);
assert.throws(() => a.parseCategory(form({ slug: 'ok', name: 'x', parent_slug: 'ok' })), /own parent/i);

const list = a.releaseChecklist({ active: true, price_inr: 0, file_url: null, release_approved: false, scan_status: 'pending', third_party: false });
assert.deepEqual(list.map(i => i.ok), [true, false, false, false, false]);
console.log('Admin catalogue checks passed: sale parsing (IST), category validation, release checklist.');
