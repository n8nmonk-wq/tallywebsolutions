import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { load } from './test-commerce.mjs';

const db = new PGlite();
await db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
for (const n of readdirSync(new URL('../migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort())
  await db.exec(readFileSync(new URL(`../migrations/${n}`, import.meta.url), 'utf8'));
const sql = async (parts, ...v) => (await db.query(parts.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), v)).rows;
const orders = load('src/lib/admin-orders.ts', { './db': { sql } });

for (let i = 0; i < 30; i++)
  await db.query(`insert into orders(id,email,name,items,subtotal,total,status,created_at) values($1,$2,$3,'[]',100,100,$4,$5)`,
    [`order-${i}`, i % 2 ? 'asha@example.com' : 'ravi@example.com', i % 2 ? 'Asha' : 'Ravi', i % 3 ? 'fulfilled' : 'created', `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z`]);

const f = orders.parseOrderFilter({ q: ' ASHA ', status: 'fulfilled', page: '2' });
assert.deepEqual(f, { q: 'asha', status: 'fulfilled', from: '', to: '', page: 2 });
assert.equal(orders.parseOrderFilter({ status: 'drop table', page: '-4' }).status, '');
assert.equal(orders.parseOrderFilter({ page: 'x' }).page, 1);

const all = await orders.listOrders(orders.parseOrderFilter({}), 10);
assert.equal(all.total, 30);
assert.equal(all.rows.length, 10);
const asha = await orders.listOrders(orders.parseOrderFilter({ q: 'asha', status: 'fulfilled' }), 50);
assert.ok(asha.rows.every(r => r.email === 'asha@example.com' && r.status === 'fulfilled'));
const wildcard = await orders.listOrders(orders.parseOrderFilter({ q: '%' }), 50);
assert.equal(wildcard.total, 0, 'a percent sign is a literal, not a wildcard');
const ranged = await orders.listOrders(orders.parseOrderFilter({ from: '2026-10-05', to: '2026-10-06' }), 50);
assert.ok(ranged.rows.every(r => r.created_at >= '2026-10-05' && r.created_at < '2026-10-07'));
await db.close();
console.log('Admin order checks passed: filters, literal search, date range, pagination.');
