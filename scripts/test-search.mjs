import assert from 'node:assert/strict';
import { load } from './test-commerce.mjs';

const S = load('src/lib/search.ts');
const b = (title, extra = {}) => ({ slug: title.toLowerCase().replace(/\W+/g, '-'), title, authorship: 'Meera Iyer', isbn: null, cover: null, price: 100, onSale: false, saleable: true, ...extra });
const books = [b('The Monsoon Ledger'), b('Monsoon'), b('Paper Boats', { authorship: 'Arjun Monsoonwala' }), b('Seasons of Monsoon Rain'),
  b('Code for Everyone', { isbn: '9781234567897' }), ...Array.from({ length: 10 }, (_, i) => b(`Monsoon Notes ${i}`))];

assert.equal(S.normaliseQuery(null), '');
assert.equal(S.normaliseQuery(' m '), '');
assert.equal(S.normaliseQuery('  MONSOON   Rain '), 'monsoon rain');
assert.equal(S.normaliseQuery('x'.repeat(500)).length, 80);

const r = S.rankSuggestions(books, [{ slug: 'monsoon-reads', name: 'Monsoon reads' }], [{ id: 'a1', name: 'Arjun Monsoonwala' }], 'monsoon');
assert.equal(r.books.length, 6);
assert.deepEqual(r.books.slice(0, 2).map(x => x.title), ['Monsoon', 'Monsoon Notes 0']);
assert.ok(!('isbn' in r.books[0]) && !('description' in r.books[0]), 'only public suggestion fields');
assert.deepEqual(r.authors.map(a => a.id), ['a1']);
assert.deepEqual(r.categories.map(c => c.slug), ['monsoon-reads']);
assert.deepEqual(S.rankSuggestions(books, [], [], '9781234567897').books.map(x => x.title), ['Code for Everyone']);
for (const hostile of ['%', '_', "'", '<script>', '.*'])
  assert.deepEqual(S.rankSuggestions(books, [], [], S.normaliseQuery(hostile + hostile)), { books: [], authors: [], categories: [] });

const route = load('src/app/api/search/suggest/route.ts', {
  '@/lib/store-data': { getStoreBooks: async () => books, getCategories: async () => [], getPublishedAuthors: async () => [] },
  '@/lib/rate-limit': { clientKey: () => 'k', consumeLimit: async () => allowed },
  '@/lib/search': S,
});
let allowed = true;
const call = async q => route.GET(new Request(`https://example.com/api/search/suggest?q=${encodeURIComponent(q)}`));
const ok = await call('monsoon');
assert.equal(ok.status, 200);
assert.equal((await ok.json()).books.length, 6);
const evil = await call('<script>alert(1)</script>');
assert.equal(evil.status, 200);
assert.doesNotMatch(await evil.text(), /<script>/);
assert.deepEqual(await (await call('a')).json(), { books: [], authors: [], categories: [] });
allowed = false;
assert.equal((await call('monsoon')).status, 429);
console.log('Search checks passed: normalisation, ranking, limits, public fields, hostile input, rate limit.');
