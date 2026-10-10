import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test, expect, register, withDatabase } from './fixtures.js';
const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { hash } = requireBackend('./migrations/backup');
const base = 'http://localhost:5000/api';
const email = 'yaramattiyashu13@gmail.com';
const names = ['users', 'products', 'suppliers', 'sales', 'stocktransactions', 'expiryalerts', 'demodatasets'];
async function snapshot() { return withDatabase(async db => {
  const out = {}; for (const name of names) out[name] = Object.fromEntries((await db.collection(name).find({}).sort({ _id: 1 }).toArray()).map(doc => [String(doc._id), hash(doc)])); return out;
}); }
function child(args, input = '') {
  return new Promise((resolve, reject) => {
    const processChild = spawn(process.execPath, args, { cwd: backend, env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    processChild.stdout.on('data', data => stdout += data); processChild.stderr.on('data', data => stderr += data);
    processChild.on('error', () => reject(new Error('Child could not start')));
    processChild.on('exit', code => resolve({ code, stdout, stderr })); processChild.stdin.end(input);
  });
}
const cli = (...args) => child(['migrations/cli.js', ...args]);
test.beforeEach(async () => {
  expect(process.env.NODE_ENV).toBe('test'); expect(process.env.GEMINI_API_KEY).toBe('');
  await withDatabase(async db => { expect(db.databaseName).toMatch(/^sim_[a-f0-9]{32}$/); expect(await db.collection('__verification_owner').findOne({ _id: db.databaseName.slice(4) })).not.toBeNull(); });
});
test('Grocery transfer preserves real records, login, all relationships and calculations; backup recovery, isolation, conflicts, guarded lifecycle and repeat execution work', async ({ page, request, account }) => {
  test.setTimeout(420_000);
  const targetAccount = { ...account, email, name: 'Existing retailer' }; account.additional.push(targetAccount);
  const target = await register(request, targetAccount, 'GROCERY');
  const outsider = await register(request, account, 'GROCERY');
  const fresh = { ...account, email: `empty-${randomUUID()}@example.invalid`, name: 'New retailer' }; account.additional.push(fresh);
  const newUser = await register(request, fresh, 'GROCERY');
  const post = async (url, data) => { const response = await request.post(base + url, { headers: target.headers, data }); expect(response.status()).toBe(201); return response.json(); };
  const supplier = await post('/suppliers', { name: 'Existing supplier' });
  const realProduct = await post('/products', { name: 'Existing product', sku: 'REAL-01', supplier: supplier._id, sellingPrice: 10, quantity: 0 });
  await post('/inventory/stock-in', { product: realProduct._id, quantity: 10, reason: 'Existing stock' });
  await post('/sales', { product: realProduct._id, quantity: 1 });
  const passwords = Object.fromEntries(['MEDICAL', 'RESTAURANT', 'GROCERY', 'CLOTHING'].map(type => [type, `Verification-${randomUUID()}`]));
  const seeded = await child(['-e', "require('dotenv').config({quiet:true});const m=require('mongoose');let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',async()=>{try{await m.connect(process.env.MONGO_URI);await require('./demo/seed').seedDemo({namespace:'presentation',passwords:JSON.parse(input)});}catch{process.exitCode=1;}finally{await m.disconnect();}});"], JSON.stringify(passwords)); expect(seeded.code).toBe(0);
  const groceryLogin = await request.post(base + '/auth/login', { data: { email: 'demo.grocery@example.com', password: passwords.GROCERY } }); expect(groceryLogin.status()).toBe(200);
  const sourceHeaders = { Authorization: 'Bearer ' + (await groceryLogin.json()).token };
  const sourceAlerts = await (await request.get(base + '/ai/expiry-alerts', { headers: sourceHeaders })).json();
  expect((await request.patch(base + '/ai/expiry-alerts/' + sourceAlerts.alerts[0]._id + '/dismiss', { headers: sourceHeaders })).status()).toBe(200);
  const original = await snapshot(), targetId = target.user._id;
  const file = path.join(backend, 'test-results', `migration-backup-${randomUUID()}.json`);
  let applied = false;
  try {
    const missing = await cli('plan', '--target-id=000000000000000000000001'); expect(missing.code).toBe(1);
    const planned = await cli('plan', '--target-id=' + targetId); expect(planned.code).toBe(0); expect(JSON.parse(planned.stdout).counts).toEqual({ products: 12, suppliers: 3, sales: 214, stocktransactions: 226, expiryalerts: 6 });
    const collision = await post('/products', { name: 'Collision', sku: 'GROCERY-01', sellingPrice: 10 });
    const conflict = await cli('plan', '--target-id=' + targetId); expect(conflict.code).toBe(1); expect(conflict.stderr).toContain('collision');
    expect((await request.delete(base + '/products/' + collision._id, { headers: target.headers })).status()).toBe(200); expect(await snapshot()).toEqual(original);
    const backup = await cli('backup', '--backup=' + file); expect(backup.code).toBe(0); const evidence = JSON.parse(backup.stdout); expect(evidence.verifiedRestore).toBeTruthy();
    const text = fs.readFileSync(file, 'utf8'); expect(text.includes(email)).toBeFalsy(); expect(text.includes('Existing product')).toBeFalsy();
    const args = ['--target-id=' + targetId, '--backup=' + file, '--backup-hash=' + evidence.sha256];
    const moved = await cli('apply', ...args); expect(moved.code).toBe(0); applied = true; expect(JSON.parse(moved.stdout).copies).toBe(0);
    const after = await snapshot(); const repeat = await cli('apply', ...args); expect(repeat.code).toBe(0); expect(JSON.parse(repeat.stdout).repeated).toBeTruthy(); expect(await snapshot()).toEqual(after);
    expect(after.users).toEqual(original.users); expect(after.demodatasets).toEqual(original.demodatasets);
    const get = async (url, headers = target.headers) => { const response = await request.get(base + url, { headers }); expect(response.status()).toBe(200); return response.json(); };
    const products = await get('/products'), suppliers = await get('/suppliers'), sales = await get('/sales'), movements = await get('/inventory/transactions?limit=500');
    expect(products).toHaveLength(13); expect(suppliers).toHaveLength(4); expect(sales).toHaveLength(215); expect(movements).toHaveLength(228);
    expect(JSON.stringify([products, suppliers, sales, movements])).not.toMatch(/\bDEMO\b|\bSAMPLE DATA\b/i);
    expect((await get('/products', outsider.headers))).toEqual([]); expect((await get('/sales', newUser.headers))).toEqual([]);
    for (const headers of [outsider.headers, newUser.headers, sourceHeaders]) {
      const migrated = products.find(product => product.sku === 'GROCERY-07');
      expect((await request.get(base + '/products/' + migrated._id, { headers })).status()).toBe(404);
      expect((await request.put(base + '/products/' + migrated._id, { headers, data: { name: 'Denied' } })).status()).toBe(404);
      expect((await request.post(base + '/sales', { headers, data: { product: migrated._id, quantity: 1 } })).status()).toBe(404);
      expect((await request.post(base + '/inventory/stock-out', { headers, data: { product: migrated._id, quantity: 1 } })).status()).toBe(404);
      expect((await request.get(base + '/suppliers/' + products.find(p => p.sku === 'GROCERY-01').supplier._id, { headers })).status()).toBe(404);
      expect((await get('/reports/dashboard', headers)).totalProducts).toBe(0);
      expect((await get('/ai/reorder-suggestions', headers)).source).toBe('NO_DATA');
      expect((await get('/ai/expiry-alerts', headers)).alerts).toEqual([]);
    }
    const expiry = (await get('/ai/expiry-alerts')).alerts; expect(expiry).toHaveLength(5);
    expect(expiry.some(row => row._id === sourceAlerts.alerts[0]._id)).toBeFalsy();
    const noSales = products.find(row => row.sku === 'GROCERY-05'); expect(expiry.find(row => row.productId === noSales._id).recommendation.suggestedPurchaseQuantity).toBeNull();
    const recommendations = await get('/ai/reorder-suggestions'); expect(recommendations.source).toBe('RULE_BASED'); expect(recommendations.suggestions.find(row => row.productId === products.find(p => p.sku === 'GROCERY-07')._id).suggestedReorderQuantity).toBe(249);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(targetAccount.password); await page.getByRole('button', { name: 'Login', exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('.stats .stat strong').first()).toHaveText('13');
    for (const [label, selector, count] of [['Products', '.products-panel tbody tr', 13], ['Suppliers', '.suppliers-panel tbody tr', 4], ['Inventory', '.stock-overview tbody tr', 13], ['Sales', '.sales-history-panel tbody tr', 20], ['Reports', 'canvas', 3]]) {
      await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click(); await expect(page.locator(selector)).toHaveCount(count);
      expect(await page.locator('body').innerText()).not.toMatch(/\bDEMO\b|\bSAMPLE DATA\b/i);
    }
    await page.getByRole('navigation').getByRole('link', { name: 'AI Recommendations', exact: true }).click(); await page.getByRole('button', { name: 'Generate AI Recommendations', exact: true }).click(); await expect(page.locator('.ai-status-label')).toHaveText('Rule-based fallback'); expect(await page.locator('body').innerText()).not.toMatch(/\bDEMO\b|\bSAMPLE DATA\b/i); expect(errors).toEqual([]);
    const stored = await withDatabase(db => db.collection('products').findOne({ _id: requireBackend('mongoose').Types.ObjectId.createFromHexString(products.find(p => p.sku === 'GROCERY-07')._id) }));
    const stockIn = await post('/inventory/stock-in', { product: String(stored._id), quantity: 2 });
    const stockOut = await post('/inventory/stock-out', { product: String(stored._id), quantity: 1 });
    const sale = await post('/sales', { product: String(stored._id), quantity: 1 });
    expect((await get('/products/' + stored._id)).quantity).toBe(stored.quantity);
    const refusal = await cli('rollback', ...args); expect(refusal.code).toBe(1); expect(refusal.stderr).toContain('dependencies');
    // Reverse only these invocation-owned test transactions, never application records.
    await withDatabase(async db => {
      const ObjectId = requireBackend('mongoose').Types.ObjectId;
      await db.collection('sales').deleteOne({ _id: new ObjectId(sale._id), createdBy: new ObjectId(targetId) });
      await db.collection('stocktransactions').deleteMany({ createdBy: new ObjectId(targetId), $or: [{ _id: { $in: [new ObjectId(stockIn.transaction._id), new ObjectId(stockOut.transaction._id)] } }, { reason: 'Sale ' + sale._id }] });
      await db.collection('products').replaceOne({ _id: stored._id }, stored);
    });
    for (const command of ['seed', 'credentials', 'reset-passwords', 'cleanup']) {
      const guarded = await child(['demo/presentation.js', command]); expect(guarded.code).toBe(1); expect(guarded.stderr).toContain('transferred records');
    }
    const reverted = await cli('rollback', ...args); expect(reverted.code).toBe(0); applied = false; expect(await snapshot()).toEqual(original);
    expect((await request.post(base + '/auth/login', { data: { email, password: targetAccount.password } })).status()).toBe(200);
    expect((await cli('apply', ...args)).code).toBe(1);
  } finally {
    if (!applied) { const cleaned = await child(['-e', "require('dotenv').config({quiet:true});const m=require('mongoose');(async()=>{await m.connect(process.env.MONGO_URI);try{await require('./demo/seed').cleanupDemo('presentation');}finally{await m.disconnect();}})().catch(()=>{process.exitCode=1});"]); expect(cleaned.code).toBe(0); }
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});
