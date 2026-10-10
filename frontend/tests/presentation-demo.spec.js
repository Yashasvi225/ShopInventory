import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { test, expect, register, withDatabase } from './fixtures.js';

const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const base = 'http://localhost:5000/api';
const types = ['MEDICAL', 'RESTAURANT', 'GROCERY', 'CLOTHING'];
const key = 'sim-p2-demo-v1:presentation';
const hash = document => createHash('sha256').update(JSON.stringify(document)).digest('hex');
async function snapshot() {
  return withDatabase(async db => {
    const result = {};
    for (const name of ['users', 'products', 'suppliers', 'sales', 'stocktransactions', 'expiryalerts', 'demodatasets']) result[name] = Object.fromEntries((await db.collection(name).find({}).sort({ _id: 1 }).toArray()).map(document => [String(document._id), hash(document)]));
    return result;
  });
}
function run(command, file, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(backend, 'demo/presentation.js'), command], { cwd: backend,
      env: { ...process.env, SIM_DEMO_CREDENTIAL_FILE: file, ...extra }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.on('error', () => reject(new Error('Presentation child process could not start')));
    child.on('exit', code => resolve({ code, stdout, stderr }));
  });
}
function passwordsFrom(output) {
  const pairs = [...output.matchAll(/^LOCAL_DEMO_CREDENTIAL (\w+) (\S+) (\S+)$/gm)];
  expect(pairs).toHaveLength(4);
  return Object.fromEntries(pairs.map(([, type, email, password]) => { expect(email).toBe(`demo.${type.toLowerCase()}@example.com`); return [type, password]; }));
}
function tempFile() {
  const dir = path.join(backend, 'test-results'); fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `presentation-${randomUUID()}.json`);
}
test.beforeEach(async () => {
  expect(process.env.NODE_ENV).toBe('test'); expect(process.env.GEMINI_API_KEY).toBe('');
  await withDatabase(async db => { expect(db.databaseName).toMatch(/^sim_[a-f0-9]{32}$/); expect(await db.collection('__verification_owner').findOne({ _id: db.databaseName.slice(4) })).not.toBeNull(); });
});

test('Presentation CLI seeds four unique accounts, real balanced history and predictions; repetition, encrypted retrieval and password reset preserve records', async ({ page, request, account }) => {
  test.setTimeout(300_000);
  const sentinel = await register(request, account, 'GROCERY');
  const before = await snapshot(), file = tempFile(); let seeded = false;
  try {
    const first = await run('seed', file); expect(first.code).toBe(0); seeded = true;
    const passwords = passwordsFrom(first.stdout); expect(new Set(Object.values(passwords)).size).toBe(4);
    const vaultText = fs.readFileSync(file, 'utf8'); for (const password of Object.values(passwords)) expect(vaultText.includes(password)).toBeFalsy();
    const created = await snapshot();
    const repeat = await run('seed', file); expect(repeat.code).toBe(0); expect(repeat.stdout).toContain('already exists'); expect(repeat.stdout).not.toContain('LOCAL_DEMO_CREDENTIAL'); expect(await snapshot()).toEqual(created);
    const revealed = await run('credentials', file); expect(revealed.code).toBe(0); expect(JSON.stringify(passwordsFrom(revealed.stdout)) === JSON.stringify(passwords)).toBeTruthy();
    const manifest = await withDatabase(db => db.collection('demodatasets').findOne({ _id: key })); expect(manifest.owners).toHaveLength(4);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const owner of manifest.owners) {
      const login = await request.post(base + '/auth/login', { data: { email: owner.email, password: passwords[owner.shopType] } }); expect(login.status()).toBe(200);
      const session = await login.json(), headers = { Authorization: `Bearer ${session.token}` };
      const get = async url => { const response = await request.get(base + url, { headers }); expect(response.status()).toBe(200); return response.json(); };
      const products = await get('/products'), suppliers = await get('/suppliers'), sales = await get('/sales'), movements = await get('/inventory/transactions?limit=500');
      expect(products).toHaveLength(12); expect(suppliers).toHaveLength(3); expect(sales).toHaveLength(owner.shopType === 'CLOTHING' ? 217 : 214); expect(movements).toHaveLength(sales.length + 12);
      for (const product of products) {
        expect(String(product.createdBy)).toBe(String(owner.userId));
        const relevant = movements.filter(row => row.product?._id === product._id);
        expect(relevant.reduce((total, row) => total + (row.type === 'STOCK_IN' ? row.quantity : -row.quantity), 0)).toBe(product.quantity);
        const history = sales.filter(row => row.product?._id === product._id);
        expect(history.reduce((sum, row) => sum + row.quantity, 0)).toBe(relevant.filter(row => row.type === 'STOCK_OUT').reduce((sum, row) => sum + row.quantity, 0));
        expect(history.every(row => row.totalAmount === Number((row.quantity * row.sellingPrice).toFixed(2)))).toBeTruthy();
      }
      expect((await request.get(base + '/products/' + products[0]._id, { headers: sentinel.headers })).status()).toBe(404);
      const alerts = (await get('/ai/expiry-alerts')).alerts;
      if (owner.shopType === 'CLOTHING') { expect(alerts).toEqual([]); expect(products.every(product => product.expiryDate === null)).toBeTruthy(); expect(new Set(products.map(product => product.fashionType))).toEqual(new Set(['OLD_FASHION', 'NEW_FASHION'])); }
      else {
        expect(alerts).toHaveLength(6); expect(new Set(alerts.map(alert => alert.daysRemaining))).toEqual(new Set([0, 1, 2]));
        const bySku = suffix => alerts.find(alert => alert.productId === products.find(product => product.sku.endsWith(suffix))._id);
        expect(bySku('-01').recommendation.suggestedPurchaseQuantity).toBeGreaterThan(bySku('-03').recommendation.suggestedPurchaseQuantity);
        expect(bySku('-03').recommendation.suggestedPurchaseQuantity).toBeGreaterThan(bySku('-04').recommendation.suggestedPurchaseQuantity);
        expect(bySku('-05').recommendationStatus).toBe('NO_DATA'); expect(bySku('-05').recommendation.suggestedPurchaseQuantity).toBeNull();
      }
      const recommendations = await get('/ai/reorder-suggestions'); expect(recommendations.source).toBe('RULE_BASED');
      expect(recommendations.suggestions.some(row => row.productId === products.find(product => product.sku.endsWith('-07'))._id)).toBeTruthy();
      expect(recommendations.suggestions.some(row => row.productId === products.find(product => product.sku.endsWith('-10'))._id)).toBeFalsy();
      await page.goto('/login'); await page.evaluate(() => localStorage.clear()); await page.reload();
      await page.getByLabel('Email', { exact: true }).fill(owner.email); await page.getByLabel('Password', { exact: true }).fill(passwords[owner.shopType]); await page.getByRole('button', { name: 'Login', exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.locator('.stats .stat strong').first()).toHaveText('12'); await expect(page.locator('.expiry-list article')).toHaveCount(owner.shopType === 'CLOTHING' ? 0 : 6);
      for (const [label, selector, count] of [['Products', '.products-panel tbody tr', 12], ['Suppliers', '.suppliers-panel tbody tr', 3], ['Sales', '.sales-history-panel tbody tr', 20]]) {
        await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click(); await expect(page.locator(selector)).toHaveCount(count);
      }
      await page.getByRole('navigation').getByRole('link', { name: 'Reports', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(3);
    }
    expect(errors).toEqual([]);
    const reset = await run('reset-passwords', file); expect(reset.code).toBe(0); const next = passwordsFrom(reset.stdout);
    for (const type of types) { expect(next[type] === passwords[type]).toBeFalsy(); expect((await request.post(base + '/auth/login', { data: { email: `demo.${type.toLowerCase()}@example.com`, password: passwords[type] } })).status()).toBe(401); expect((await request.post(base + '/auth/login', { data: { email: `demo.${type.toLowerCase()}@example.com`, password: next[type] } })).status()).toBe(200); }
    const afterReset = await snapshot(); for (const name of Object.keys(created).filter(name => name !== 'users')) expect(afterReset[name]).toEqual(created[name]);
    const repeatReset = await run('seed', file); expect(repeatReset.code).toBe(0); expect(repeatReset.stdout).not.toContain('LOCAL_DEMO_CREDENTIAL'); expect(await snapshot()).toEqual(afterReset);
    const cleanup = await run('cleanup', file); expect(cleanup.code).toBe(0); seeded = false; expect(cleanup.stdout).toContain('"removed":true'); expect(await snapshot()).toEqual(before);
  } finally {
    if (seeded) { const cleanup = await run('cleanup', file); expect(cleanup.code).toBe(0); }
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test('Presentation seed refuses an existing reserved email and rolls back instead of adopting or overwriting the account', async ({ request, account }) => {
  const owner = { ...account, email: 'demo.medical@example.com', name: account.name + ' collision' }; account.additional.push(owner);
  await register(request, owner, 'MEDICAL'); const before = await snapshot(), file = tempFile();
  try {
    const result = await run('seed', file); expect(result.code).toBe(1); expect(result.stderr).toContain('refusing to adopt or overwrite'); expect(result.stdout).not.toContain('LOCAL_DEMO_CREDENTIAL'); expect(await snapshot()).toEqual(before);
    const reset = await run('reset-passwords', file); expect(reset.code).toBe(1); expect(reset.stderr).toContain('Seed the presentation accounts'); expect(await snapshot()).toEqual(before);
  } finally { if (fs.existsSync(file)) fs.unlinkSync(file); }
});

test('Production rejects all presentation commands before creating a vault or changing the database', async () => {
  const file = tempFile(), before = await snapshot();
  for (const command of ['seed', 'credentials', 'reset-passwords', 'cleanup']) { const result = await run(command, file, { NODE_ENV: 'production' }); expect(result.code).toBe(1); expect(result.stderr).toContain('disabled in production'); expect(fs.existsSync(file)).toBeFalsy(); }
  expect(await snapshot()).toEqual(before);
});
