// Offline regression suite: transpile real modules; replace only external boundaries.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
export function load(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === './db' || name === '@/lib/db') throw new Error('Real database access forbidden in commerce tests');
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks);
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)), mocks);
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}

let failed = 0;
let passed = 0;
export async function check(name, fn) {
  const reportError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (err) {
    failed++;
    reportError(`FAIL ${name}: ${err.message}`);
    for (const args of errors) reportError(...args);
  } finally { console.error = reportError; }
}
export function finish() { console.log(`${passed} passed; ${failed} failed`); if (failed) process.exitCode = 1; }

if (process.argv[1] === import.meta.filename) {
  process.env.DOWNLOAD_SECRET = 'offline-commerce-secret';
  const token = load('src/lib/token.ts');
  const money = load('src/lib/money.ts');
  await check('valid token round trips', () => assert.deepEqual(token.verifyDownloadToken(token.mintDownloadToken('order_1', 'book-a')), { orderId: 'order_1', slug: 'book-a' }));
  await check('signed NaN expiry cannot grant access', () => {
    const data = 'order_1|book-a|NaN';
    const mac = crypto.createHmac('sha256', process.env.DOWNLOAD_SECRET).update(data).digest('hex');
    assert.equal(token.verifyDownloadToken(`${Buffer.from(data).toString('base64url')}.${mac}`), null);
  });
  await check('extra token segments rejected', () => assert.equal(token.verifyDownloadToken(`${token.mintDownloadToken('order_1', 'book-a')}.extra`), null));
  await check('licence is domain-separated and does not disclose receipt', () => {
    const licence = token.licenceId('order_1', 'book-a');
    assert.match(licence, /^[a-f0-9]{24}$/);
    assert.notEqual(licence, token.licenceId('order_1', 'book-b'));
    assert.ok(!licence.includes('order_1'));
  });
  await check('integer server prices total exactly', () => assert.deepEqual(money.computeTotals([19900, 29900]), { subtotal: 49800, tax: 0, total: 49800 }));
  for (const price of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
    await check(`invalid price ${price} rejected`, () => assert.throws(() => money.computeTotals([price])));
  }
  await check('cart overflow rejected', () => assert.throws(() => money.computeTotals([2147483647, 1])));
  await check('PDF failures do not return unlicensed originals', async () => {
    const pdf = load('src/lib/pdf.ts');
    await assert.rejects(() => pdf.stampPdf(new Uint8Array([1, 2, 3]), 'Licence test'));
  });
  const email = load('src/lib/email.ts');
  await check('email failure is retryable rather than success', async () => {
    delete process.env.RESEND_API_KEY;
    await assert.rejects(() => email.orderConfirmation({ id: 'order_1', email: 'reader@example.com', items: [], total: 100, tax: 0, created_at: '2026-01-01' }, 'https://example.com'));
  });
  finish();
}
