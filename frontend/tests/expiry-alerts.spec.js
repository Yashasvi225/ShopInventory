import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { test, expect, register, withDatabase, ObjectId } from './fixtures.js';

const base = 'http://localhost:5000/api';
const isoDay = offset => new Date(Date.parse(new Date().toISOString().slice(0, 10)) + offset * 86_400_000).toISOString().slice(0, 10);
const createProduct = async (request, session, extra = {}) => {
  const response = await request.post(`${base}/products`, { headers: session.headers, data: {
    name: 'Expiry verification product', sku: 'EXPIRY-VERIFY', sellingPrice: 10, quantity: 100, ...extra,
  } });
  expect(response.status()).toBe(201);
  return response.json();
};
async function dashboard(page, session) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
  }, session);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}
async function alerts(request, session, apiBase = base) {
  const response = await request.get(`${apiBase}/ai/expiry-alerts`, { headers: session.headers });
  expect(response.status()).toBe(200);
  return (await response.json()).alerts;
}
async function completeAlert(request, session, product, apiBase = base) {
  let found;
  await expect.poll(async () => {
    found = (await alerts(request, session, apiBase)).find(alert => alert.productId === product._id);
    return found?.recommendationStatus;
  }, { timeout: 70_000, intervals: [200, 500, 1000] }).toMatch(/^(READY|UNAVAILABLE|NO_DATA)$/);
  return found;
}
async function recordSales(request, session, product) {
  for (const [quantity, offset] of [[12, -10], [9, -7], [9, -3]]) {
    const response = await request.post(`${base}/sales`, { headers: session.headers,
      data: { product: product._id, quantity, date: `${isoDay(offset)}T12:00:00.000Z` } });
    expect(response.status()).toBe(201);
  }
}

for (const shopType of ['MEDICAL', 'RESTAURANT', 'GROCERY']) {
  test(`${shopType}: date boundaries, actual warnings, duplicate prevention and expiry changes`, async ({ page, request, account }) => {
    const session = await register(request, account, shopType);
    const products = [];
    for (const offset of [0, 1, 2, 3, -1]) products.push(await createProduct(request, session, {
      name: `${shopType} expiry ${offset}`, sku: `EXPIRY-${offset}`, expiryDate: isoDay(offset),
    }));
    await createProduct(request, session, { name: 'No expiry', sku: 'NO-EXPIRY' });
    const invalid = await request.post(`${base}/products`, { headers: session.headers,
      data: { name: 'Invalid date', sku: 'INVALID', sellingPrice: 10, expiryDate: 'invalid-date' } });
    expect(invalid.status()).toBe(400);
    const first = await alerts(request, session);
    expect(first).toHaveLength(3); expect(first.map(alert => alert.daysRemaining)).toEqual([0, 1, 2]);
    const requests = await Promise.all(Array.from({ length: 5 }, () => alerts(request, session)));
    for (const result of requests) expect(result.map(alert => alert._id)).toEqual(first.map(alert => alert._id));
    const done = await completeAlert(request, session, products[0]);
    expect(done.recommendationStatus).toBe('NO_DATA');
    expect(done.recommendation.suggestedPurchaseQuantity).toBeNull();
    expect(done.recommendation.salesBasis.unitsSold).toBe(0);
    await dashboard(page, session);
    const warnings = page.getByRole('region', { name: 'Expiry warnings · next 2 days' });
    await expect(warnings.getByRole('article')).toHaveCount(3);
    await expect(warnings).toContainText('Expires today');
    await expect(warnings).toContainText('Expires in 1 day');
    await expect(warnings).toContainText('Expires in 2 days');
    await expect(warnings).toContainText('Not enough data');
    await page.reload();
    await expect(warnings.getByRole('article')).toHaveCount(3);
    await warnings.getByRole('button', { name: `Dismiss warning for ${products[0].name}`, exact: true }).click();
    await expect(warnings.getByRole('article')).toHaveCount(2);
    await page.reload();
    await expect(warnings.getByRole('article')).toHaveCount(2);
    expect(await alerts(request, session)).toHaveLength(2);
    expect((await withDatabase(db => db.collection('expiryalerts').countDocuments({ createdBy: new ObjectId(session.user._id) })))).toBe(3);
    // A different date is a new expiry event; the old dismissal stays intact.
    expect((await request.put(`${base}/products/${products[0]._id}`, { headers: session.headers,
      data: { expiryDate: isoDay(1) } })).status()).toBe(200);
    const changed = await alerts(request, session);
    expect(changed).toHaveLength(3);
    expect(changed.find(alert => alert.productId === products[0]._id)._id).not.toBe(first[0]._id);
    expect((await request.delete(`${base}/products/${products[0]._id}`, { headers: session.headers })).status()).toBe(200);
    expect(await alerts(request, session)).toHaveLength(2);
    expect((await request.put(`${base}/products/${products[1]._id}`, { headers: session.headers,
      data: { expiryDate: null } })).status()).toBe(200);
    expect(await alerts(request, session)).toHaveLength(1);
  });
}

test('Clothing has neither alerts nor expiry UI, even for legacy malformed product data', async ({ page, request, account }) => {
  const session = await register(request, account, 'CLOTHING');
  const product = await createProduct(request, session, { fashionType: 'NEW_FASHION', expiryDate: isoDay(0) });
  expect(product.expiryDate).toBeNull();
  await withDatabase(db => db.collection('products').updateOne({ _id: new ObjectId(product._id), createdBy: new ObjectId(session.user._id) },
    { $set: { expiryDate: new Date(isoDay(1)) } }));
  const alertRequests = [];
  page.on('request', request => { if (request.url().includes('/ai/expiry-alerts')) alertRequests.push(request.url()); });
  expect(await alerts(request, session)).toEqual([]);
  await dashboard(page, session);
  await expect(page.getByRole('region', { name: 'Expiry warnings · next 2 days' })).toHaveCount(0);
  expect(alertRequests).toEqual([]);
  expect(await withDatabase(db => db.collection('expiryalerts').countDocuments({ createdBy: new ObjectId(session.user._id) }))).toBe(0);
  expect((await request.get(`${base}/products/${product._id}`, { headers: session.headers }).then(response => response.json())).fashionType).toBe('NEW_FASHION');
});

test('Real Gemini explains actual owner sales; persisted quantity and stock remain safe', async ({ page, request, account }) => {
  const runtimeErrors = [], missingAssets = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && /\.(js|jsx|css|png|svg|ico)(?:\?|$)/.test(response.url())) missingAssets.push(response.url());
  });
  const session = await register(request, account, 'GROCERY');
  const product = await createProduct(request, session, { expiryDate: isoDay(20) });
  await recordSales(request, session, product);
  expect((await request.put(`${base}/products/${product._id}`, { headers: session.headers, data: { expiryDate: isoDay(2) } })).status()).toBe(200);
  const generated = await completeAlert(request, session, product);
  const basis = generated.recommendation.salesBasis;
  expect(basis.unitsSold).toBe(30); expect(basis.saleCount).toBe(3); expect(basis.saleDays).toBe(3);
  expect(basis.observationDays).toBe(11); expect(basis.confidence).toBe('MODERATE');
  expect(generated.currentStock).toBe(70); expect(generated.recommendation.suggestedPurchaseQuantity).toBe(20);
  console.log(`Stage 3 live expiry Gemini result: ${generated.recommendationStatus}, source: ${generated.recommendation.source}`);
  // An external outage is reported honestly; it must still show a real estimate.
  expect(['READY', 'UNAVAILABLE']).toContain(generated.recommendationStatus);
  if (generated.recommendationStatus === 'READY') expect(generated.recommendation.source).toBe('GEMINI');
  await dashboard(page, session);
  const warning = page.getByRole('article', { name: `Expiry warning for ${product.name}` });
  await expect(warning).toContainText('Suggested next purchase: 20 units');
  await expect(warning).toContainText('30 units recorded over 11 calendar day(s)');
  await expect(warning).toContainText('Current stock: 70');
  await expect(warning).toContainText('Moderate evidence');
  if (generated.recommendationStatus === 'READY') await expect(warning).toContainText('Gemini-assisted explanation');
  const repeats = await Promise.all(Array.from({ length: 5 }, () => alerts(request, session)));
  for (const result of repeats) expect(result[0]._id).toBe(generated._id);
  const saved = await withDatabase(db => db.collection('expiryalerts').findOne({ _id: new ObjectId(generated._id) }));
  expect(saved.attempts).toBe(1);
  await alerts(request, session);
  const polled = await withDatabase(db => db.collection('expiryalerts').findOne({ _id: new ObjectId(generated._id) }));
  expect(polled.updatedAt).toEqual(saved.updatedAt); // Ready/unavailable polling performs no repeat write or provider call.
  const unchanged = await request.get(`${base}/products/${product._id}`, { headers: session.headers });
  expect((await unchanged.json()).quantity).toBe(70);
  // API payload and served bundles must never contain the configured secret.
  if (process.env.GEMINI_API_KEY) {
    expect(JSON.stringify(generated)).not.toContain(process.env.GEMINI_API_KEY);
    const html = await page.request.get('/dashboard').then(response => response.text());
    for (const match of html.matchAll(/src="([^\"]+\.js)"/g)) {
      expect(await page.request.get(match[1]).then(response => response.text())).not.toContain(process.env.GEMINI_API_KEY);
    }
    const directory = new URL('../dist/assets/', import.meta.url);
    for (const file of await readdir(directory)) {
      expect(await readFile(new URL(file, directory), 'utf8')).not.toContain(process.env.GEMINI_API_KEY);
    }
  }
  await warning.screenshot({ path: 'test-results/stage3-expiry-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(warning).toBeVisible();
  await warning.getByText('Sales basis and limitations', { exact: true }).click();
  await expect(warning.getByText(basis.limitation, { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await warning.screenshot({ path: 'test-results/stage3-expiry-mobile.png' });
  expect(runtimeErrors).toEqual([]); expect(missingAssets).toEqual([]);
});

test('Timeout and invalid provider responses preserve real persisted warnings with safe fallback quantities', async ({ page, request, account }) => {
  const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
  const mongoose = requireBackend('mongoose');
  const ExpiryAlert = requireBackend('./models/ExpiryAlert');
  const { processAlert } = requireBackend('./services/expiryAlertService');
  const { boundedGeminiCall, validateExpiryRecommendation } = requireBackend('./services/geminiService');
  const session = await register(request, account, 'MEDICAL');
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
    for (const failure of ['TIMEOUT', 'INVALID_RESPONSE', 'RATE_LIMIT']) {
      const product = await createProduct(request, session, { name: `Provider ${failure} verification`, sku: failure, expiryDate: isoDay(20) });
      expect((await request.post(`${base}/sales`, { headers: session.headers, data: { product: product._id, quantity: 2 } })).status()).toBe(201);
      await request.put(`${base}/products/${product._id}`, { headers: session.headers, data: { expiryDate: isoDay(1) } });
      const alert = await ExpiryAlert.create({ createdBy: session.user._id, store: product.store, product: product._id, shopType: 'MEDICAL', expiryDay: isoDay(1) });
      await processAlert(alert._id, async item => {
        if (failure === 'TIMEOUT') return boundedGeminiCall(() => new Promise(() => {}), 10);
        if (failure === 'RATE_LIMIT') return boundedGeminiCall(async () => { const error = new Error('Provider quota exceeded'); error.status = 429; throw error; });
        return validateExpiryRecommendation({ productId: item.productId, suggestedPurchaseQuantity: -999,
          reason: 'RECORDED_DEMAND', caution: 'LIMITED_HISTORY' }, item);
      });
      const saved = await ExpiryAlert.findById(alert._id).lean();
      expect(saved.recommendationStatus).toBe('UNAVAILABLE'); expect(saved.attempts).toBe(1);
      expect(saved.recommendation.source).toBe('APPLICATION');
      expect(saved.recommendation.salesBasis.unitsSold).toBe(2);
      expect(saved.recommendation.suggestedPurchaseQuantity).toBe(14);
      const unchanged = await request.get(`${base}/products/${product._id}`, { headers: session.headers });
      expect((await unchanged.json()).quantity).toBe(98);
    }
    await dashboard(page, session);
    await expect(page.getByRole('article')).toHaveCount(3);
    for (const article of await page.getByRole('article').all()) {
      await expect(article).toContainText('Gemini explanation is temporarily unavailable');
      await expect(article).toContainText('Suggested next purchase: 14 units');
      await expect(article).toContainText('Limited confidence');
    }
  } finally { await mongoose.disconnect(); }
});

test('Alert ownership and sales basis cannot cross retailers', async ({ request, account }) => {
  const first = await register(request, account, 'MEDICAL');
  const other = { name: `${account.name} other`, email: account.email.replace('@', '-other@'), password: account.password };
  account.additional.push(other);
  const second = await register(request, other, 'GROCERY');
  const owned = await createProduct(request, first, { expiryDate: isoDay(20) });
  const foreign = await createProduct(request, second, { name: 'Other retailer expiry product', expiryDate: isoDay(1) });
  const realSale = await request.post(`${base}/sales`, { headers: first.headers, data: { product: owned._id, quantity: 2 } });
  expect(realSale.status()).toBe(201);
  const blockedSale = await request.post(`${base}/sales`, { headers: second.headers, data: { product: owned._id, quantity: 9000 } });
  expect(blockedSale.status()).toBe(404);
  // Defence-in-depth test: malformed imported history, solely test-owned, must
  // also be excluded from the query and Gemini input.
  await withDatabase(db => db.collection('sales').insertOne({ product: new ObjectId(owned._id), createdBy: new ObjectId(second.user._id),
    quantity: 9000, sellingPrice: 1, totalAmount: 9000, date: new Date() }));
  await request.put(`${base}/products/${owned._id}`, { headers: first.headers, data: { expiryDate: isoDay(1) } });
  const ownAlert = await completeAlert(request, first, owned);
  expect(ownAlert.recommendation.salesBasis.unitsSold).toBe(2);
  expect(ownAlert.recommendation.salesBasis.confidence).toBe('LIMITED');
  const foreignAlert = await completeAlert(request, second, foreign);
  expect((await alerts(request, first)).map(alert => alert.productId)).toEqual([owned._id]);
  expect((await alerts(request, second)).map(alert => alert.productId)).toEqual([foreign._id]);
  expect((await request.get(`${base}/ai/expiry-alerts`)).status()).toBe(401);
  expect((await request.patch(`${base}/ai/expiry-alerts/${ownAlert._id}/dismiss`)).status()).toBe(401);
  expect((await request.patch(`${base}/ai/expiry-alerts/${foreignAlert._id}/dismiss`, { headers: first.headers })).status()).toBe(404);
  expect((await request.patch(`${base}/ai/expiry-alerts/not-an-id/dismiss`, { headers: first.headers })).status()).toBe(400);
  expect((await request.patch(`${base}/ai/expiry-alerts/${new ObjectId()}/dismiss`, { headers: first.headers })).status()).toBe(404);
});

test('An injected provider failure preserves the startup warning and deterministic estimate in the UI', async ({ page, request, account }) => {
  const session = await register(request, account, 'RESTAURANT');
  const product = await createProduct(request, session, { expiryDate: isoDay(20) });
  await recordSales(request, session, product);
  await request.put(`${base}/products/${product._id}`, { headers: session.headers, data: { expiryDate: isoDay(1) } });
  // The same application/DB on a separate port, with a provider failure injected
  // before startup. This exercises persistence and the actual API/UI without
  // spending provider quota on an intentionally failing model. No success is faked.
  const startup = `
    const service = require('./services/geminiService');
    service.generateExpiryRecommendation = async () => service.boundedGeminiCall(async () => {
      const error = new Error('Injected provider unavailable'); error.status = 503; throw error;
    });
    require('./server');
  `;
  const child = spawn(process.execPath, ['-e', startup], {
    cwd: fileURLToPath(new URL('../../backend/', import.meta.url)),
    env: { ...process.env, PORT: '5001' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  try {
    await expect.poll(async () => {
      try { return (await request.get('http://localhost:5001/api/health')).status(); } catch { return 0; }
    }, { timeout: 30_000 }).toBe(200);
    // Startup background detection must create a persisted warning before any
    // browser or alerts API request is made for this retailer.
    await expect.poll(async () => withDatabase(db => db.collection('expiryalerts').countDocuments({
      createdBy: new ObjectId(session.user._id), product: new ObjectId(product._id),
    }))).toBe(1);
    const warning = await completeAlert(request, session, product, 'http://localhost:5001/api');
    expect(warning.recommendationStatus).toBe('UNAVAILABLE');
    expect(warning.recommendation.source).toBe('APPLICATION');
    expect(warning.recommendation.suggestedPurchaseQuantity).toBe(20);
    expect(output).toContain('Expiry recommendation unavailable');
    if (process.env.GEMINI_API_KEY) expect(output).not.toContain(process.env.GEMINI_API_KEY);
    await dashboard(page, session);
    await expect(page.getByRole('article', { name: `Expiry warning for ${product.name}` })).toContainText('Gemini explanation is temporarily unavailable');
    await expect(page.getByRole('article')).toContainText('Suggested next purchase: 20 units');
    expect((await alerts(request, session))[0]._id).toBe(warning._id);
    const saved = await withDatabase(db => db.collection('expiryalerts').findOne({ _id: new ObjectId(warning._id) }));
    expect(saved.attempts).toBe(1);
    expect(new Date(saved.retryAt) > new Date()).toBeTruthy();
  } finally {
    child.kill();
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  }
});
