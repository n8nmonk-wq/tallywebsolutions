import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

export async function applySchema(client) {
  const directory = new URL('../migrations/', import.meta.url);
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  await client.query('begin');
  try {
    await client.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
    for (const name of names) await client.query(await readFile(new URL(name, directory), 'utf8'));
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  assert.ok(process.argv.includes('--apply'), 'Explicit --apply is required. Use an isolated Neon branch and backup before applying to production.');
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required.');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { await applySchema(client); console.log('Additive schema and migrations applied.'); }
  finally { await client.end(); }
}
