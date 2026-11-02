import assert from 'node:assert/strict';
import { load } from './test-commerce.mjs';

const L = load('src/lib/listing.ts');
const b = (slug, extra = {}) => ({ slug, title: slug, subtitle: null, authorship: 'Ana', author_slug: 'ana', description: null, isbn: null, category_slug: 'fiction', language: 'English',
  file_format: 'PDF', price: 29900, regular: 29900, onSale: false, saving: 0, saleable: true, comingSoon: false, release_date: '2026-01-01', ...extra });
const books = [b('alpha', { price: 15000 }), b('beta', { category_slug: 'crime', onSale: true, saving: 5000, price: 24900 }), b('gamma', { language: 'Hindi', file_format: 'EPUB', price: 120000, release_date: '2026-09-01' }),
  b('delta', { authorship: 'Ravi', author_slug: 'ravi', category_slug: 'science', isbn: '9781234567897' })];

const p = L.parseListing({ q: '  ALPHA ', offer: '1', price: '200-499', sort: 'price-asc', page: '3', category: 'x y' });
assert.deepEqual(p, { q: 'alpha', category: '', author: '', language: '', format: '', price: '200-499', offer: true, sort: 'price-asc', page: 3 });
assert.equal(L.parseListing({ q: 'x'.repeat(500) }).q.length, 120);
assert.equal(L.parseListing({ sort: 'drop', price: '5-6', page: '-1' }).sort, '');

const all = L.parseListing({});
assert.deepEqual(L.filterBooks(books, { ...all, q: '9781234567897' }).map(x => x.slug), ['delta']);
assert.deepEqual(L.filterBooks(books, { ...all, q: '%' }).map(x => x.slug), [], 'percent is a literal');
assert.deepEqual(L.filterBooks(books, { ...all, offer: true }).map(x => x.slug), ['beta']);
assert.deepEqual(L.filterBooks(books, { ...all, price: '0-199' }).map(x => x.slug), ['alpha']);
assert.deepEqual(L.filterBooks(books, { ...all, price: '1000+' }).map(x => x.slug), ['gamma']);
assert.deepEqual(L.filterBooks(books, { ...all, sort: 'price-desc' }).map(x => x.slug), ['gamma', 'delta', 'beta', 'alpha']);
assert.deepEqual(L.filterBooks(books, { ...all, sort: 'new' })[0].slug, 'gamma');
assert.deepEqual(L.filterBooks(books, all, { categoryFamily: ['fiction', 'crime'] }).map(x => x.slug), ['alpha', 'beta', 'gamma']);
assert.deepEqual(L.filterBooks(books, { ...all, sort: 'popular' }, { popularity: ['delta', 'beta'] }).map(x => x.slug).slice(0, 2), ['delta', 'beta']);

const f = L.facets(books, { ...all, language: 'Hindi' }, [{ slug: 'fiction', name: 'Fiction' }, { slug: 'crime', name: 'Crime' }, { slug: 'science', name: 'Science' }]);
const lang = f.find(x => x.key === 'language');
assert.deepEqual(lang.options.map(o => [o.value, o.count, o.active]), [['English', 3, false], ['Hindi', 1, true]], 'own facet ignores its own filter');
assert.deepEqual(f.find(x => x.key === 'category').options.map(o => [o.value, o.count]), [['fiction', 1]], 'other facets respect active language');

const pages = L.paginate(Array.from({ length: 50 }, (_, i) => i), 9, 24);
assert.deepEqual([pages.page, pages.pages, pages.total, pages.items.length], [3, 3, 50, 2], 'page clamps to the last page');
assert.equal(L.listingHref('/search', { ...all, q: 'a b', page: 4 }, { language: 'Hindi' }), '/search?q=a+b&language=Hindi');
assert.equal(L.listingHref('/search', { ...all, page: 1 }, { page: 2 }), '/search?page=2');
console.log('Listing checks passed: parsing caps, literal search, price bands, offers, sorts, family, facets, pagination, hrefs.');
