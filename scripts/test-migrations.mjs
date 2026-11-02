import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { applySchema } from './migrate.mjs';
import { PGlite } from '@electric-sql/pglite';

for (const script of ['scripts/migrate.mjs', 'scripts/seed.mjs']) {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Explicit/);
}
const db = new PGlite();
// pg accepts whole SQL scripts; exec exercises the same runner in isolated Postgres.
const client = { query: statement => db.exec(statement) };
try {
  await applySchema(client);
  await db.query(`insert into books(slug,title,price_inr) values('historical','Historical edition',100)`);
  await applySchema(client);
  assert.equal((await db.query(`select price_inr from books where slug='historical'`)).rows[0].price_inr, 100);
} finally { await db.close(); }
console.log('Migration checks passed: explicit write guards, whole SQL scripts, reruns, and preserved historical records.');
