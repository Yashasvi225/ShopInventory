import { createRequire } from 'node:module';
import { test, expect, register, withDatabase, ObjectId } from './fixtures.js';

const base = 'http://localhost:5000/api';
const today = () => new Date().toISOString().slice(0, 10);
const create = async (request, session, extra = {}) => {
  const response = await request.post(`${base}/products`, { headers: session.headers,
    data: { name: 'Hardening verification product', sku: 'HARDENING', sellingPrice: 5, quantity: 5, minimumStock: 0, ...extra } });
  expect(response.status()).toBe(201); return response.json();
};
const get = async (request, session, path) => {
  const response = await request.get(`${base}${path}`, { headers: session.headers }); expect(response.ok()).toBeTruthy(); return response.json();
};
async function signIn(page, account) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
}

test('Malformed product/stock/sale requests are rejected before any inventory or history change', async ({ request, account }) => {
  for (const password of ['a'.repeat(73), '\u00e9'.repeat(37)]) {
    const rejected = await request.post(`${base}/auth/register`, { data: { name: account.name, email: account.email, password } });
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).message).toContain('72 UTF-8 bytes');
  }
  expect(await withDatabase(db => db.collection('users').countDocuments({ email: account.email }))).toBe(0);
  const session = await register(request, account, 'GROCERY');
  const product = await create(request, session);
  expect((await request.put(`${base}/auth/shop-type`, { headers: session.headers, data: { shopType: ['GROCERY'] } })).status()).toBe(400);
  for (const quantity of [true, null, [], {}, '', -1, 0.5, 1e20]) {
    for (const path of ['/inventory/stock-in', '/inventory/stock-out', '/sales']) {
      expect((await request.post(`${base}${path}`, { headers: session.headers, data: { product: product._id, quantity } })).status()).toBe(400);
    }
  }
  for (const data of [{ quantity: true }, { quantity: null }, { quantity: [] }, { sellingPrice: {} }, { name: {} }, { supplier: false }, { expiryDate: '2026-02-30' }]) {
    expect((await request.put(`${base}/products/${product._id}`, { headers: session.headers, data })).status()).toBe(400);
  }
  for (const path of ['/inventory/stock-in', '/sales']) {
    expect((await request.post(`${base}${path}`, { headers: session.headers, data: { product: product._id, quantity: 1, date: '2026-02-30' } })).status()).toBe(400);
  }
  expect((await request.post(`${base}/products`, { headers: session.headers, data: [] })).status()).toBe(400);
  const invalidJson = await request.post(`${base}/products`, { headers: { ...session.headers, 'Content-Type': 'application/json' }, data: '{invalid json' });
  expect(invalidJson.status()).toBe(400); expect(await invalidJson.json()).toEqual({ message: 'Request body must be valid JSON' });
  expect((await get(request, session, `/products/${product._id}`)).quantity).toBe(5);
  expect(await get(request, session, '/sales')).toEqual([]); expect(await get(request, session, '/inventory/transactions')).toEqual([]);
  for (const path of ['/sales?limit=1000000', '/inventory/transactions?limit=-1', '/sales?from=invalid', '/sales?from=2030-01-01&to=2020-01-01']) {
    expect((await request.get(`${base}${path}`, { headers: session.headers })).status()).toBe(400);
  }
  expect(await get(request, session, '/products?search=%5B')).toEqual([]);
  expect(await get(request, session, '/suppliers?search=%5B')).toEqual([]);
});

test('Concurrent sales cannot oversell; stale edits and wrong-store writes cannot overwrite inventory', async ({ request, account }) => {
  const session = await register(request, account, 'RESTAURANT');
  const product = await create(request, session);
  const responses = await Promise.all(Array.from({ length: 8 }, () => request.post(`${base}/sales`,
    { headers: session.headers, data: { product: product._id, quantity: 1, date: today() } })));
  expect(responses.filter(response => response.status() === 201)).toHaveLength(5);
  expect(responses.filter(response => response.status() === 400)).toHaveLength(3);
  expect((await get(request, session, `/products/${product._id}`)).quantity).toBe(0);
  expect(await get(request, session, '/sales')).toHaveLength(5);
  expect(await get(request, session, '/inventory/transactions')).toHaveLength(5);
  expect((await get(request, session, '/reports/daily')).unitsSold).toBe(5);
  expect((await get(request, session, '/reports/dashboard')).todaySales).toBe(25);
  const futureProduct = await create(request, session, { sku: 'FUTURE-SALE' });
  const future = new Date(); future.setUTCDate(future.getUTCDate() + 3);
  expect((await request.post(`${base}/sales`, { headers: session.headers, data: { product: futureProduct._id, quantity: 1, date: future.toISOString() } })).status()).toBe(201);
  expect((await get(request, session, '/reports/daily')).unitsSold).toBe(5);
  expect((await get(request, session, '/reports/monthly')).unitsSold).toBe(5);
  const stale = await request.put(`${base}/products/${product._id}`, { headers: session.headers,
    data: { quantity: 5, expectedQuantity: 5, name: 'Stale overwrite' } });
  expect(stale.status()).toBe(409);
  expect((await get(request, session, `/products/${product._id}`)).name).toBe(product.name);
  await withDatabase(db => db.collection('products').updateOne({ _id: new ObjectId(product._id), createdBy: new ObjectId(session.user._id) }, { $set: { shopType: 'MEDICAL' } }));
  for (const path of ['/inventory/stock-in', '/inventory/stock-out', '/sales']) {
    expect((await request.post(`${base}${path}`, { headers: session.headers, data: { product: product._id, quantity: 1 } })).status()).toBe(409);
  }
});

test('History-write failures abort stock and sales atomically in the actual database', async ({ request, account }) => {
  const session = await register(request, account, 'GROCERY');
  const product = await create(request, session);
  const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
  const mongoose = requireBackend('mongoose');
  const StockTransaction = requireBackend('./models/StockTransaction');
  const { stockIn } = requireBackend('./controllers/inventoryController');
  const { createSale } = requireBackend('./controllers/saleController');
  const original = StockTransaction.create;
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
    const store = await requireBackend('./models/Store').findOne({createdBy:session.user._id}).lean();
    StockTransaction.create = async () => { throw new Error('Injected history-write failure'); };
    for (const operation of [stockIn, createSale]) {
      let failure;
      await operation({ user: { _id: new mongoose.Types.ObjectId(session.user._id), shopType: 'GROCERY' },
        store, body: { product: product._id, quantity: 1 } }, { status() { throw new Error('Unexpected commit'); } }, error => { failure = error; });
      expect(failure.message).toBe('Injected history-write failure');
      expect((await get(request, session, `/products/${product._id}`)).quantity).toBe(5);
      expect(await get(request, session, '/sales')).toEqual([]); expect(await get(request, session, '/inventory/transactions')).toEqual([]);
    }
  } finally { StockTransaction.create = original; await mongoose.disconnect(); }
});

test('Every sensitive route requires authentication; foreign references never populate retailer data', async ({ request, account }) => {
  const first = await register(request, account, 'GROCERY');
  const identity = { name: `${account.name} foreign`, email: account.email.replace('@', '-foreign@'), password: account.password };
  account.additional.push(identity); const second = await register(request, identity, 'MEDICAL');
  const product = await create(request, second, { name: 'Private foreign product' });
  const supplierResponse = await request.post(`${base}/suppliers`, { headers: second.headers, data: { name: 'Private foreign supplier' } });
  const supplier = await supplierResponse.json();
  for (const path of ['/products', '/suppliers', '/sales', '/inventory/transactions', '/reports/dashboard', '/reports/daily', '/reports/weekly', '/reports/monthly', '/reports/inventory', '/reports/low-stock', '/reports/expiry', '/ai/expiry-alerts', '/ai/reorder-suggestions', '/auth/shop-type']) {
    expect((await request.get(`${base}${path}`)).status()).toBe(401);
  }
  for (const [method, path, data] of [['post', '/products', {}], ['post', '/suppliers', {}], ['post', '/sales', {}],
    ['post', '/inventory/stock-in', {}], ['post', '/inventory/stock-out', {}], ['put', '/auth/shop-type', {}],
    ['put', `/products/${product._id}`, {}], ['delete', `/products/${product._id}`, undefined], ['patch', `/ai/expiry-alerts/${new ObjectId()}/dismiss`, {}]]) {
    expect((await request[method](`${base}${path}`, { data })).status()).toBe(401);
  }
  for (const resource of ['products', 'suppliers']) {
    const id = resource === 'products' ? product._id : supplier._id;
    for (const method of ['get', 'put', 'delete']) expect((await request[method](`${base}/${resource}/${id}`, { headers: first.headers, ...(method === 'put' ? { data: {} } : {}) })).status()).toBe(404);
  }
  expect(await get(request, first, '/products')).toEqual([]); expect(await get(request, first, '/sales')).toEqual([]);
  expect(await get(request, first, '/inventory/transactions')).toEqual([]);
  expect((await get(request, first, '/reports/dashboard')).totalStock).toBe(0);
  expect((await get(request, first, '/ai/reorder-suggestions')).source).toBe('NO_DATA');
  const owned = await create(request, first);
  // Corrupted imported references are test-owned; the referenced retailer is
  // also a temporary account. Only the references should be hidden, not history.
  await withDatabase(async db => {
    await db.collection('products').updateOne({ _id: new ObjectId(owned._id) }, { $set: { supplier: new ObjectId(supplier._id) } });
    await db.collection('sales').insertOne({ product: new ObjectId(product._id), createdBy: new ObjectId(first.user._id), store: new ObjectId(owned.store), quantity: 1, totalAmount: 5, sellingPrice: 5, date: new Date() });
    await db.collection('stocktransactions').insertOne({ product: new ObjectId(product._id), createdBy: new ObjectId(first.user._id), store: new ObjectId(owned.store), type: 'STOCK_IN', quantity: 1, reason: '', date: new Date() });
  });
  expect((await get(request, first, '/products'))[0].supplier).toBeNull();
  expect((await get(request, first, '/sales'))[0].product).toBeNull();
  expect((await get(request, first, '/inventory/transactions'))[0].product).toBeNull();
  const dashboard = await get(request, first, '/reports/dashboard');
  expect(dashboard.recentSales[0].product).toBeNull(); expect(dashboard.recentTransactions[0].product).toBeNull();
  const response = await request.get(`${base}/products`, { headers: first.headers });
  expect(response.headers()['cache-control']).toBe('no-store'); expect(response.headers()['x-content-type-options']).toBe('nosniff');
});

for (const shopType of ['MEDICAL', 'GROCERY', 'RESTAURANT', 'CLOTHING']) {
  test(`${shopType}: mobile login, keyboard modal, product edit, stock, sale, reports and logout`, async ({ page, request, account }) => {
    const session = await register(request, account, shopType);
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await signIn(page, account);
    expect(await page.locator('#sidebar').evaluate(element => element.inert)).toBe(true);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Dashboard', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
    const nav = async label => {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    };
    await nav('Products');
    await page.getByRole('button', { name: 'Add Product', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused();
    expect(await page.locator('#root').evaluate(element => element.inert)).toBe(true);
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused();
    await page.getByLabel('Name', { exact: true }).fill('Mobile workflow verification');
    await page.getByLabel('SKU', { exact: true }).fill('MOBILE');
    await page.getByLabel('Purchase Price').fill('1'); await page.getByLabel('Selling Price').fill('5');
    await page.getByLabel('Quantity', { exact: true }).fill('10'); await page.getByLabel('Minimum Stock').fill('0');
    if (shopType === 'CLOTHING') {
      await expect(page.getByLabel('Expiry Date')).toHaveCount(0); await page.getByLabel('Fashion', { exact: true }).selectOption('NEW_FASHION');
    } else {
      const future = new Date(); future.setUTCDate(future.getUTCDate() + 2); await page.getByLabel('Expiry Date').fill(future.toISOString().slice(0, 10));
    }
    await dialog.screenshot({ path: `test-results/stage4-${shopType.toLowerCase()}-mobile-form.png` });
    let release; const gate = new Promise(resolve => { release = resolve; }); let submitted = 0;
    await page.route('**/api/products', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      submitted++; await gate; await route.continue();
    });
    await dialog.locator('form').evaluate(form => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await expect.poll(() => submitted).toBe(1); await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
    release(); await expect(dialog).toHaveCount(0); expect(submitted).toBe(1);
    await page.unroute('**/api/products');
    await expect(page.getByRole('button', { name: 'Add Product', exact: true })).toBeFocused();
    const row = page.getByRole('row').filter({ hasText: 'Mobile workflow verification' });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    if (shopType === 'CLOTHING') await page.getByLabel('Fashion', { exact: true }).selectOption('OLD_FASHION');
    await page.getByLabel('Description').fill('Mobile edit verified'); await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0); const [product] = await get(request, session, '/products');
    expect(product.description).toBe('Mobile edit verified'); if (shopType === 'CLOTHING') expect(product.fashionType).toBe('OLD_FASHION');
    await nav('Inventory'); await page.getByRole('button', { name: 'Stock Transaction' }).click();
    await page.getByLabel('Product', { exact: true }).selectOption(product._id);
    await page.getByLabel('Quantity', { exact: true }).fill('2'); await page.getByLabel('Reason').fill('Mobile stock verification');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'Mobile stock verification' })).toBeVisible();
    await nav('Sales'); await page.getByRole('button', { name: 'Record Sale' }).click();
    await page.getByLabel('Product', { exact: true }).selectOption(product._id); await page.getByLabel('Quantity', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Save Sale' }).click(); await expect(dialog).toHaveCount(0);
    expect((await get(request, session, `/products/${product._id}`)).quantity).toBe(11);
    await nav('Reports'); await expect(page.locator('canvas')).toHaveCount(3);
    await expect(page.getByRole('img', { name: 'Historical recorded sales revenue', exact: true })).toBeVisible();
    await nav('Dashboard');
    if (shopType !== 'CLOTHING') {
      const warning = page.getByRole('article', { name: 'Expiry warning for Mobile workflow verification' });
      await expect(warning).toBeVisible(); await expect(warning).toContainText('Current stock: 11');
      await warning.getByRole('button', { name: 'Dismiss warning for Mobile workflow verification' }).click();
      await expect(warning).toHaveCount(0); await page.reload(); await expect(warning).toHaveCount(0);
    } else await expect(page.getByRole('heading', { name: /Expiry warnings/ })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.getByRole('button', { name: 'Open navigation' }).click(); await page.getByRole('link', { name: 'Logout', exact: true }).click();
    await expect(page).toHaveURL(/login$/); expect(errors).toEqual([]);
  });
}

test('Network, malformed responses and HTTP error states stay visible without React crashes', async ({ page, request, account }) => {
  await register(request, account, 'GROCERY'); await signIn(page, account);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Deliberately malformed HTTP-200 payloads exercise nested fields the views
  // render or call string methods on; these fault responses are never persisted.
  const product = { _id: 'contract-probe', name: 'Contract probe', sku: 'CONTRACT', quantity: 1, minimumStock: 0, sellingPrice: 1 };
  for (const [status, body, message] of [[400, { message: 'Invalid request' }, 'Invalid request'], [403, {}, 'permission'],
    [404, { message: 'Product not found' }, 'Product not found'], [409, { message: 'Duplicate value' }, 'already exists'],
    [429, {}, 'Too many requests'], [500, { message: 'PRIVATE_INTERNAL_SECRET' }, 'server could not'],
    [200, { broken: true }, 'invalid response'], [200, 'invalid-json', 'invalid response'],
    [200, [{ ...product, category: { invalid: true } }], 'invalid response'],
    [200, [{ ...product, expiryDate: {} }], 'invalid response'],
    [200, [{ ...product, supplier: { _id: 'supplier-probe', name: {} } }], 'invalid response']]) {
    await page.route('**/api/products', route => route.fulfill({ status, contentType: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) }));
    await page.goto('/products'); await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByText('PRIVATE_INTERNAL_SECRET')).toHaveCount(0); await page.unroute('**/api/products');
  }
  const sale = { _id: 'sale-probe', quantity: 1, totalAmount: 1, product: { name: 10 } };
  const transaction = { _id: 'transaction-probe', quantity: 1, type: 'STOCK_IN', product: { name: {} } };
  const dashboard = Object.fromEntries(['totalProducts', 'totalStock', 'totalInventoryValue', 'todaySales', 'monthlySales', 'lowStockCount', 'outOfStockCount', 'expiringCount'].map(key => [key, 0]));
  const alert = { _id: 'alert-probe', productName: 'Contract probe', expiryDay: today(), currentStock: 1, daysRemaining: 0,
    shopType: 'GROCERY', recommendationStatus: 'UNAVAILABLE', recommendation: { explanation: 'Malformed basis probe',
      salesBasis: { unitsSold: {}, observationDays: 1, saleDays: 1, currentStockAtAnalysis: 1, limitation: 'Fault injection' } } };
  for (const [path, pageUrl, body] of [
    ['/sales', '/sales', [sale]],
    ['/inventory/transactions', '/inventory', [transaction]],
    ['/suppliers', '/suppliers', [{ _id: 'supplier-probe', name: 'Contract probe', address: {} }]],
    ['/reports/dashboard', '/dashboard', { ...dashboard, recentSales: [], recentTransactions: [transaction] }],
    ['/ai/expiry-alerts', '/dashboard', { alerts: [alert] }],
  ]) {
    const routePattern = path === '/sales' ? '**/api/sales?*' : `**/api${path}`;
    await page.route(routePattern, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
    await page.goto(pageUrl); await expect(page.getByRole('alert').first()).toContainText('invalid response');
    await page.unroute(routePattern);
  }
  await page.route('**/api/products', route => route.abort('failed'));
  await page.goto('/products'); await expect(page.getByRole('alert')).toContainText('Cannot connect'); await page.unroute('**/api/products');
  await page.route('**/api/products', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.goto('/products'); await expect(page).toHaveURL(/login$/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull(); expect(errors).toEqual([]);
});

test('A hung frontend request times out and releases its loading state', async ({ page, request, account }) => {
  await register(request, account, 'GROCERY'); await signIn(page, account);
  await page.clock.install(); let release; const held = new Promise(resolve => { release = resolve; }); let seen = false;
  await page.route('**/api/products', async route => { seen = true; await held; await route.abort(); });
  await page.goto('/products'); await expect.poll(() => seen).toBe(true);
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('alert')).toContainText('Request timed out');
  release();
});
