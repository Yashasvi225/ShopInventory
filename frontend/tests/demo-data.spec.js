import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { test, expect, register, withDatabase } from './fixtures.js';
const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const mongoose = requireBackend('mongoose');
const { seedDemo, cleanupDemo, identity, datasetKey } = requireBackend('./demo/seed');
const { buildStore } = requireBackend('./demo/data');
const { salesBasis } = requireBackend('./domain/expiryAlerts');
const Dataset = requireBackend('./demo/DemoDataset');
const User = requireBackend('./models/User');
const Product = requireBackend('./models/Product');
const base = 'http://localhost:5000/api';
const namespace = () => `test-${randomUUID()}`;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function login(request, owner, password) {
  const response = await request.post(`${base}/auth/login`, { data: { email: owner.email, password } });
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.user.shopType).toBe(owner.shopType);
  return { ...data, headers: { Authorization: `Bearer ${data.token}` } };
}
async function get(request, session, path) {
  const response = await request.get(`${base}${path}`, { headers: session.headers });
  expect(response.ok(), `${path}: HTTP ${response.status()}`).toBeTruthy(); return response.json();
}
async function snapshot() {
  return withDatabase(async db => {
    const result = {};
    for (const name of ['users', 'products', 'suppliers', 'sales', 'stocktransactions', 'expiryalerts', 'demodatasets']) {
      result[name] = Object.fromEntries((await db.collection(name).find({}).toArray()).map(doc => [String(doc._id), hash(doc)]));
    }
    return result;
  });
}

test('Four-store demo: idempotence, real API predictions, history balance, authentication and cleanup preserve unrelated records', async ({ page, request, account }) => {
  test.setTimeout(240_000);
  const other = await register(request, account, 'GROCERY');
  const sentinel = await request.post(`${base}/products`, { headers: other.headers, data: { name: 'Existing verification inventory', sku: 'PRESERVE', sellingPrice: 15, quantity: 42 } });
  expect(sentinel.status()).toBe(201);
  const before = await snapshot(), ns = namespace(), now = new Date();
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const first = await seedDemo({ namespace: ns, password: account.password, now });
    expect(first.inserted).toBeTruthy();
    expect(first.stores.map(store => store.products)).toEqual([12, 12, 12, 12]);
    expect(first.stores.map(store => store.suppliers)).toEqual([3, 3, 3, 3]);
    expect(first.stores.map(store => store.sales)).toEqual([214, 214, 214, 217]);
    expect(first.stores.map(store => store.stockTransactions)).toEqual([226, 226, 226, 229]);
    expect(first.stores.map(store => store.expiryAlerts)).toEqual([6, 6, 6, 0]);
    const seeded = await snapshot();
    const repeated = await seedDemo({ namespace: ns, password: account.password, now });
    expect(repeated.inserted).toBeFalsy();
    expect(await snapshot()).toEqual(seeded);
    await expect(seedDemo({ namespace: ns, password: 'wrong-demo-password', now })).rejects.toThrow('password does not match');
    expect(await snapshot()).toEqual(seeded);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const owner of first.dataset.owners) {
      const session = await login(request, owner, account.password);
      const products = await get(request, session, '/products');
      const sales = await get(request, session, '/sales');
      const stocks = await get(request, session, '/inventory/transactions?limit=500');
      expect(products).toHaveLength(12);
      for (const product of products) {
        expect(String(product.createdBy)).toBe(String(owner.userId));
        const transactions = stocks.filter(stock => stock.product?._id === product._id);
        const balance = transactions.reduce((sum, stock) => sum + (stock.type === 'STOCK_IN' ? stock.quantity : -stock.quantity), 0);
        expect(balance).toBe(product.quantity);
        const history = sales.filter(sale => sale.product?._id === product._id);
        expect(history.reduce((sum, sale) => sum + sale.quantity, 0)).toBe(transactions.filter(stock => stock.type === 'STOCK_OUT').reduce((sum, stock) => sum + stock.quantity, 0));
        expect(history.every(sale => sale.totalAmount === Number((sale.quantity * sale.sellingPrice).toFixed(2)))).toBeTruthy();
      }
      const alertResult = await get(request, session, '/ai/expiry-alerts');
      if (owner.shopType === 'CLOTHING') {
        expect(alertResult.alerts).toEqual([]);
        expect(products.every(product => product.expiryDate === null)).toBeTruthy();
        expect(new Set(products.map(product => product.fashionType))).toEqual(new Set(['OLD_FASHION', 'NEW_FASHION']));
      } else {
        expect(alertResult.alerts).toHaveLength(6);
        expect(new Set(alertResult.alerts.map(alert => alert.daysRemaining))).toEqual(new Set([0, 1, 2]));
        const predictions = [];
        for (const alert of alertResult.alerts) {
          const product = products.find(product => product._id === alert.productId);
          const records = sales.filter(sale => sale.product?._id === product._id).map(sale => ({ ...sale, product: product._id }));
          const basis = salesBasis(product, records, now);
          expect(alert.recommendation.suggestedPurchaseQuantity).toBe(basis.suggestedPurchaseQuantity);
          expect(alert.recommendation.salesBasis.unitsSold).toBe(basis.unitsSold);
          predictions.push([product.sku, basis.suggestedPurchaseQuantity]);
        }
        const quantities = new Map(predictions);
        expect(quantities.get(`DEMO-${owner.shopType}-01`)).toBeGreaterThan(quantities.get(`DEMO-${owner.shopType}-03`));
        expect(quantities.get(`DEMO-${owner.shopType}-03`)).toBeGreaterThan(quantities.get(`DEMO-${owner.shopType}-04`));
        expect(quantities.get(`DEMO-${owner.shopType}-05`)).toBeNull();
        const noData = alertResult.alerts.find(alert => alert.productId === products.find(product => product.sku.endsWith('-05'))._id);
        expect(noData.recommendationStatus).toBe('NO_DATA');
        const expired = products.find(product => product.sku.endsWith('-12'));
        expect(alertResult.alerts.some(alert => alert.productId === expired._id)).toBeFalsy();
        const expiredSale = await request.post(`${base}/sales`, { headers: session.headers, data: { product: expired._id, quantity: 1 } });
        expect(expiredSale.status()).toBe(400);
      }
      const recommendations = await get(request, session, '/ai/reorder-suggestions');
      expect(recommendations.source).toBe('RULE_BASED');
      expect(recommendations.suggestions.some(row => row.productName === buildStore(owner.shopType, now)[6].name)).toBeTruthy();
      expect(recommendations.suggestions.some(row => row.productName === buildStore(owner.shopType, now)[9].name)).toBeFalsy();
      const foreign = await request.get(`${base}/products/${products[0]._id}`, { headers: other.headers });
      expect(foreign.status()).toBe(404);
      if (alertResult.alerts.length) {
        expect((await request.patch(`${base}/ai/expiry-alerts/${alertResult.alerts[0]._id}/dismiss`, { headers: other.headers })).status()).toBe(404);
      }
      await page.goto('/login'); await page.evaluate(() => localStorage.clear()); await page.reload();
      await page.getByLabel('Email', { exact: true }).fill(owner.email);
      await page.getByLabel('Password', { exact: true }).fill(account.password);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      if (owner.shopType !== 'CLOTHING') await expect(page.getByRole('article')).toHaveCount(6);
      else await expect(page.getByRole('article')).toHaveCount(0);
      await page.getByRole('navigation').getByRole('link', { name: 'AI Recommendations', exact: true }).click();
      await page.getByRole('button', { name: 'Generate AI Recommendations', exact: true }).click();
      await expect(page.getByText('Gemini is unavailable, so safe rule-based recommendations are shown.')).toBeVisible();
      await page.getByRole('navigation').getByRole('link', { name: 'Reports', exact: true }).click();
      await expect(page.locator('canvas')).toHaveCount(3);
      await expect(page.getByRole('img', { name: 'Historical recorded sales revenue', exact: true })).toBeVisible();
    }
    const owner = first.dataset.owners[0], session = await login(request, owner, account.password);
    const alerts = (await get(request, session, '/ai/expiry-alerts')).alerts;
    expect((await request.patch(`${base}/ai/expiry-alerts/${alerts[0]._id}/dismiss`, { headers: session.headers })).status()).toBe(200);
    await seedDemo({ namespace: ns, password: account.password, now });
    expect((await get(request, session, '/ai/expiry-alerts')).alerts).toHaveLength(5);
    expect(errors).toEqual([]);
    expect(await cleanupDemo(ns)).toMatchObject({ removed: true, stores: 4 });
    expect(await cleanupDemo(ns)).toEqual({ removed: false });
    expect(await snapshot()).toEqual(before);
  } finally { await cleanupDemo(ns); await mongoose.disconnect(); }
});

test('Demo cleanup fails closed for untracked inventory and foreign references', async ({ request, account }) => {
  test.setTimeout(180_000);
  const foreign = await register(request, account, 'GROCERY'), ns = namespace();
  await mongoose.connect(process.env.MONGO_URI);
  let unknown, badReference;
  try {
    const result = await seedDemo({ namespace: ns, password: account.password });
    const owner = result.dataset.owners[0], session = await login(request, owner, account.password);
    unknown = await request.post(`${base}/products`, { headers: session.headers, data: { name: 'Demo user-added inventory must be preserved', sku: 'UNTRACKED', sellingPrice: 1, quantity: 1 } }).then(response => response.json());
    const before = await snapshot();
    await expect(cleanupDemo(ns)).rejects.toThrow('Untracked records');
    expect(await snapshot()).toEqual(before);
    await request.delete(`${base}/products/${unknown._id}`, { headers: session.headers }); unknown = null;
    // A malformed import must not make cleanup delete an unrelated owner's record.
    badReference = new mongoose.Types.ObjectId();
    await withDatabase(db => db.collection('sales').insertOne({ _id: badReference, product: owner.productIds[0], createdBy: new mongoose.Types.ObjectId(foreign.user._id), quantity: 1, sellingPrice: 1, totalAmount: 1, date: new Date() }));
    await expect(cleanupDemo(ns)).rejects.toThrow('Foreign references');
    await withDatabase(db => db.collection('sales').deleteOne({ _id: badReference, createdBy: new mongoose.Types.ObjectId(foreign.user._id) })); badReference = null;
    const productId = owner.productIds[0];
    await Product.updateOne({ _id: productId }, { $set: { createdBy: foreign.user._id } });
    await expect(cleanupDemo(ns)).rejects.toThrow('ownership/relationship mismatch');
    await Product.updateOne({ _id: productId }, { $set: { createdBy: owner.userId } });
    expect((await cleanupDemo(ns)).removed).toBeTruthy();
  } finally {
    if (unknown) await Product.deleteOne({ _id: unknown._id });
    if (badReference) await withDatabase(db => db.collection('sales').deleteOne({ _id: badReference, createdBy: new mongoose.Types.ObjectId(foreign.user._id) }));
    await cleanupDemo(ns); await mongoose.disconnect();
  }
});

test('Demo seeding refuses existing email collisions and rolls back the entire dataset', async ({ account }) => {
  const ns = namespace(), reserved = identity('MEDICAL', ns);
  await mongoose.connect(process.env.MONGO_URI);
  let sentinel;
  try {
    sentinel = await User.create({ ...reserved, name: account.name, password: account.password });
    const before = await snapshot();
    await expect(seedDemo({ namespace: ns, password: account.password })).rejects.toThrow('refusing to adopt');
    expect(await snapshot()).toEqual(before);
    expect(await Dataset.findById(datasetKey(ns))).toBeNull();
  } finally { if (sentinel) await User.deleteOne({ _id: sentinel._id, name: account.name }); await mongoose.disconnect(); }
});
