import assert from 'node:assert/strict';
import { load } from './test-commerce.mjs';

// home.ts reaches content.ts (via content-data), which imports the database client; the pure helpers never call it.
const { buildHome } = load('src/lib/home.ts', { './db': { sql() { throw new Error('No database in home tests'); } } });
const now = new Date('2026-10-15T00:00:00Z');
const book = (slug, extra = {}) => ({ slug, title: slug, cover: `/c/${slug}.png`, authorship: 'A', author_slug: null, category_slug: 'fiction', language: 'English',
  saleable: true, saveable: true, price: 100, regular: 100, onSale: false, saving: 0, comingSoon: false, release_date: '2026-01-01', year: 2026, ...extra });
const books = [book('a', { onSale: true, saving: 30, price: 70 }), book('b', { onSale: true, saving: 50, price: 50, language: 'Hindi' }),
  book('c', { comingSoon: true, release_date: '2026-11-01', saleable: false }), book('d', { category_slug: 'science', release_date: '2026-09-01', author_slug: 'au1' }),
  book('e', { category_slug: 'science', language: 'Hindi' })];
const categories = [{ slug: 'fiction', name: 'Fiction', colour: '#f00', image_url: null, parent_slug: null, sort: 0 },
  { slug: 'science', name: 'Science', colour: null, image_url: null, parent_slug: null, sort: 1 },
  { slug: 'empty', name: 'Empty', colour: null, image_url: null, parent_slug: null, sort: 2 }];
const mod = (id, type, extra = {}) => ({ id, type, title: id, body: null, image_url: null, mobile_image_url: null, link_url: null, link_label: null,
  payload: {}, sort: 0, status: 'published', publish_at: null, ends_at: null, ...extra });

const home = buildHome({ books, categories, now, bestsellers: ['ghost', 'd', 'a'],
  authors: [{ id: 'au1', name: 'Author One', photo_url: null }, { id: 'au2', name: 'No Books', photo_url: null }],
  modules: [mod('b1', 'banner', { sort: 2 }), mod('b0', 'banner', { sort: 1 }), mod('old', 'banner', { ends_at: '2026-10-01T00:00:00Z' }),
    mod('p1', 'promo', { payload: { size: 'large', category_slug: 'fiction', theme: 'coral' } }), mod('g', 'genre-switcher', { payload: { category_slugs: ['science', 'empty', 'fiction'] } })] });

assert.deepEqual(home.banners.map(b => b.id), ['b0', 'b1'], 'ordered, expired banner dropped');
assert.equal(home.promos[0].books.length, 2);
assert.ok(home.promos[0].books.every(b => b.category_slug === 'fiction' && b.saleable));
const rail = key => home.rails.find(r => r.key === key);
assert.deepEqual(rail('bestsellers').books.map(b => b.slug), ['d', 'a'], 'unknown slugs dropped, real order kept');
assert.deepEqual(rail('offers').books.map(b => b.slug), ['b', 'a']);
assert.deepEqual(rail('soon').books.map(b => b.slug), ['c']);
assert.ok(!rail('new').books.some(b => b.comingSoon));
assert.deepEqual(home.genres.map(g => g.slug), ['science', 'fiction'], 'empty genre dropped, admin order kept');
assert.deepEqual(home.languages.map(l => [l.name, l.count]), [['English', 3], ['Hindi', 2]]);
assert.ok(!('glyph' in home.languages[1]), 'languages carry names and counts only; script letterforms are retired');
assert.deepEqual(home.categoryTiles.map(t => t.slug), ['fiction', 'science']);
assert.deepEqual(home.authors.map(a => a.id), ['au1']);

const empty = buildHome({ books: [], categories: [], modules: [], bestsellers: [], authors: [], now });
assert.deepEqual([empty.banners, empty.promos, empty.rails, empty.genres, empty.languages, empty.categoryTiles, empty.authors].map(x => x.length), [0, 0, 0, 0, 0, 0, 0]);
console.log('Home assembly checks passed: banner order and expiry, promo books, honest bestsellers, rails, genres, languages, tiles, authors.');
