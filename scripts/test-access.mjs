import assert from 'node:assert/strict';
import { sameOrigin, ownsOrder, saleable } from '../src/lib/access-policy.ts';

assert.equal(sameOrigin('https://shop.example', 'https://shop.example/api/checkout'), true);
assert.equal(sameOrigin('https://attacker.example', 'https://shop.example/api/checkout'), false);
assert.equal(sameOrigin(null, 'https://shop.example/api/checkout'), false);
assert.equal(ownsOrder('reader@example.com', 'reader@example.com'), true);
assert.equal(ownsOrder(null, 'reader@example.com'), false);
assert.equal(ownsOrder('other@example.com', 'reader@example.com'), false);
const book = { active: true, price_inr: 100, file_url: 'private:book.pdf', release_approved: true, scan_status: 'clean' };
assert.equal(saleable(book), true);
assert.equal(saleable({ ...book, release_approved: false }), false);
assert.equal(saleable({ ...book, third_party: true }), false);
assert.equal(saleable({ ...book, third_party: true, rights_approved: true, commercial_approved: true }), true);
assert.equal(saleable({ ...book, scan_status: 'pending' }), false);
assert.equal(saleable({ ...book, price_inr: 0 }), false);
console.log('Access and publication gates passed');
