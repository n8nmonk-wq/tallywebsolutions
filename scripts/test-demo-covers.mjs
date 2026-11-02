// Offline: preview demo covers use only the theme palette.
import assert from 'node:assert/strict';
import { demoCover } from '../src/lib/demo-catalogue.mjs';

const PALETTE = ['#161641', '#1f1f55', '#1f1f5e', '#2e2e7e', '#1f1f2b', '#44444f', '#1d6b33', '#299637', '#eef0fa', '#c5ecd3'];
for (let seed = 0; seed < 12; seed++) {
  const svg = decodeURIComponent(demoCover('A Monsoon Ledger of Small Things', 'Ananya Rao', seed).replace('data:image/svg+xml;utf8,', ''));
  for (const colour of svg.match(/#[0-9a-fA-F]{6}/g) ?? []) assert.ok(PALETTE.includes(colour.toLowerCase()), `demo cover colour ${colour} is off-palette`);
}
console.log('Demo covers use only the theme palette.');
