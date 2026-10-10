// Read-only application checks through an API with provider/workers disabled.
const path = require('node:path');
const fs = require('node:fs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
const { chromium } = require('../../../frontend/node_modules/playwright');
const User = require('../../models/User');
const Store = require('../../models/Store');
const { hash } = require('../../migrations/backup');
const { fallbackRecommendations } = require('../../services/geminiService');
const base = 'http://localhost:5010/api';

async function main() {
  if (process.env.SIM_READ_ONLY_VERIFICATION !== '1') throw new Error('Use the provider-disabled read-only API on port 5010');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  let browser;
  try {
    const db = mongoose.connection.db;
    const snapshot = async () => {
      const result = {};
      for (const { name } of await db.listCollections().toArray()) result[name] = hash({ rows: await db.collection(name).find({}).sort({ _id: 1 }).toArray() });
      return result;
    };
    const before = await snapshot();
    browser = await chromium.launch({ channel: 'chrome' });
    const results = [];
    for (const [label, id] of [['empty-existing-account', '6ac9f0203b33bbc31c806b3a'], ['existing-inventory-owner', '6ac9c7708f22f0222f37f6d0']]) {
      const user = await User.findById(id).select('_id name email shopType shopName').lean();
      if (!user) throw new Error('Verified existing account missing');
      const store = await Store.findOne({ createdBy: user._id, shopType: 'RESTAURANT' }).lean();
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '10m' });
      const headers = { Authorization: 'Bearer ' + token, 'X-Store-Id': String(store._id) };
      const call = async url => { const r = await fetch(base + url, { headers }); if (!r.ok) throw new Error('Scoped API rejected verification'); return r.json(); };
      const products = await call('/products');
      const sales = await call('/sales?limit=500');
      if (products.some(p => p.createdBy !== id || p.store !== String(store._id))) throw new Error('Scope mismatch');
      const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - 29);
      const items = products.map(p => ({ productId: p._id, productName: p.name, currentStock: p.quantity, minimumStock: p.minimumStock, expiryDate: p.expiryDate,
        averageDailySales: Number((sales.filter(s => s.product?._id === p._id && new Date(s.date) >= start && new Date(s.date) <= new Date()).reduce((total, s) => total + s.quantity, 0) / 30).toFixed(2)) }));
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.addInitScript(value => {
        localStorage.setItem('token', value.token); localStorage.setItem('user', JSON.stringify(value.user));
        localStorage.setItem('inventory-active-store:' + value.user._id, value.store);
      }, { token, user, store: String(store._id) });
      const page = await context.newPage(), errors = [], apiRequests = [];
      page.on('pageerror', e => errors.push(e.name));
      page.on('console', m => { if (m.type() === 'error') errors.push('console'); });
      await page.route('http://localhost:5000/api/**', async route => {
        const request = route.request();
        if (!['GET', 'HEAD'].includes(request.method())) throw new Error('Verification must not write application records');
        if (request.url().endsWith('/ai/reorder-suggestions')) apiRequests.push({ method: request.method(), endpoint: '/api/ai/reorder-suggestions', activeStoreMatches: request.headers()['x-store-id'] === String(store._id) });
        await route.continue({ url: request.url().replace('http://localhost:5000/api', base) });
      });
      await page.goto('http://localhost:5500/ai-recommendations');
      await page.getByRole('combobox', { name: 'Active store', exact: true }).waitFor();
      const response = page.waitForResponse(r => r.url().endsWith('/api/ai/reorder-suggestions'));
      await page.getByRole('button', { name: 'Generate AI Recommendations', exact: true }).click();
      const http = await response, result = await http.json();
      await page.waitForFunction(() => !document.querySelector('.ai-summary[aria-busy="true"]'));
      if (http.status() !== 200 || result.suggestions.length !== fallbackRecommendations(items).length) throw new Error('Fallback/API mismatch');
      if (products.length && (result.source !== 'RULE_BASED' || result.providerError.code !== 'NOT_CONFIGURED')) throw new Error('Provider-disabled fallback not clearly identified');
      if (!products.length && (result.source !== 'NO_DATA' || result.analysis.emptyReason !== 'NO_PRODUCTS')) throw new Error('No-data analysis failed');
      const counters = await page.locator('.page-summary .stat strong').allTextContents();
      const expected = [result.suggestions.length, result.suggestions.filter(r => r.suggestedReorderQuantity > 0).length, result.suggestions.reduce((t, r) => t + r.suggestedReorderQuantity, 0)];
      if (counters.some((value, i) => value !== new Intl.NumberFormat('en-IN').format(expected[i]))) throw new Error('Visible counters mismatch');
      if (await page.locator('.recommendation-grid article').count() !== expected[0]) throw new Error('Visible cards mismatch');
      if (/\bDEMO\b|\bSAMPLE DATA\b/.test(await page.locator('body').innerText())) throw new Error('Demo labels remain');
      for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw new Error('AI page overflow'); }
      const foreign = await Store.findOne({ createdBy: { $ne: user._id } }).lean();
      for (const url of ['/products', '/suppliers', '/inventory/transactions', '/sales', '/reports/dashboard', '/reports/inventory', '/reports/expiry', '/ai/expiry-alerts', '/ai/reorder-suggestions']) {
        const denied = await fetch(base + url, { headers: { ...headers, 'X-Store-Id': String(foreign._id) } }); if (denied.status !== 404) throw new Error('Foreign-store access not denied');
      }
      const routes = ['dashboard', 'products', 'suppliers', 'inventory', 'sales', 'reports', 'ai-recommendations'];
      for (const route of routes) {
        await page.goto('http://localhost:5500/' + route); await page.locator('h1').waitFor(); await page.waitForLoadState('networkidle');
      }
      if (errors.length) throw new Error('Browser errors occurred');
      results.push({ account: label, storeType: 'RESTAURANT', products: products.length, source: result.source, providerError: result.providerError,
        suggestions: expected[0], actionable: expected[1], purchaseUnits: expected[2], visibleCountersMatch: true, apiRequests,
        foreignStoreStatuses: '404 for all nine scoped endpoints', browserErrors: 0, routes, widths: [375, 768, 1440] });
      await context.close();
    }
    const after = await snapshot();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Application database changed during read-only checks');
    const report = { verified: true, applicationDatabaseUnchanged: true, provider: 'Disabled for read-only QA; no paid generation calls',
      authentication: 'Short-lived JWT through unchanged normal middleware; private passwords not read or changed', results };
    const file = path.join(__dirname, '../..', 'test-results', 'ai-live-diagnostics.json');
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally { if (browser) await browser.close(); await mongoose.disconnect(); }
}
main().catch(e => { console.error('Read-only AI verification failed; private details withheld. Category: ' + e.name); process.exitCode = 1; });
