import assert from 'node:assert/strict';
import { load } from './test-commerce.mjs';

const { currentPrice, percentOff } = load('src/lib/money.ts');
const at = iso => new Date(iso);
const book = { price_inr: 29900, sale_price_inr: 25200 };
assert.deepEqual(currentPrice(book, at('2026-10-15T00:00:00Z')), { price: 25200, regular: 29900, onSale: true, saving: 4700 });
assert.equal(percentOff(currentPrice(book)), 16);
assert.deepEqual(currentPrice({ price_inr: 29900 }), { price: 29900, regular: 29900, onSale: false, saving: 0 });

const windowed = { ...book, sale_starts_at: '2026-10-18T00:00:00+05:30', sale_ends_at: '2026-10-20T00:00:00+05:30' };
assert.equal(currentPrice(windowed, at('2026-10-17T18:29:59.999Z')).onSale, false); // 1ms before start
assert.equal(currentPrice(windowed, at('2026-10-17T18:30:00.000Z')).onSale, true);  // start inclusive
assert.equal(currentPrice(windowed, at('2026-10-19T18:29:59.999Z')).onSale, true);  // 1ms before end
assert.equal(currentPrice(windowed, at('2026-10-19T18:30:00.000Z')).onSale, false); // end exclusive

// Corrupt rows never undercut or overcharge: invalid sale prices are ignored.
for (const sale of [0, -1, 29900, 40000, 1.5, null, undefined, NaN])
  assert.equal(currentPrice({ price_inr: 29900, sale_price_inr: sale }).price, 29900);
assert.equal(currentPrice({ ...book, sale_starts_at: 'not a date' }).onSale, false);
const { orderSavings } = load('src/lib/money.ts');
assert.equal(orderSavings({ items: [{ price: 25200, list_price: 29900 }, { price: 100 }, { price: 500, list_price: 400 }] }), 4700);
console.log('Pricing checks passed: sale windows (inclusive start, exclusive end), invalid sales ignored, percent off.');
