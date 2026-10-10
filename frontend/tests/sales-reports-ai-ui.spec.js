import { test, expect, register } from './fixtures.js';
import { productPerformance, sortSales, summarizeSales } from '../src/utils/salesView.js';

const base = 'http://localhost:5000/api';
async function create(request, session, path, data) {
  const response = await request.post(base + path, { headers: session.headers, data });
  expect(response.status()).toBe(201); return response.json();
}
async function get(request, session, path) {
  const response = await request.get(base + path, { headers: session.headers });
  expect(response.ok()).toBeTruthy(); return response.json();
}
async function restore(page, session) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
  }, { token: session.token, user: session.user });
}
const productData = (extra = {}) => ({ name: 'Sales design product', sku: 'SALE-UI', quantity: 100, minimumStock: 5, purchasePrice: 2, sellingPrice: 12.35, ...extra });

test('Sales view aggregation preserves product identity, decimal amounts, and deleted references', () => {
  const rows = [
    { product: { _id: 'one', name: 'Same name' }, quantity: 2, totalAmount: 24.7, date: '2026-10-01' },
    { product: { _id: 'two', name: 'Same name' }, quantity: 3, totalAmount: 30, date: '2026-10-02' },
    { product: null, quantity: 1, totalAmount: 4 },
  ];
  expect(summarizeSales(rows)).toEqual({ transactions: 3, revenue: 58.7, units: 6 });
  expect(productPerformance(rows)).toEqual([
    { id: 'two', name: 'Same name', sku: undefined, quantity: 3, revenue: 30, transactions: 1 },
    { id: 'one', name: 'Same name', sku: undefined, quantity: 2, revenue: 24.7, transactions: 1 },
    { id: 'deleted-products', name: 'Deleted products (combined)', sku: undefined, quantity: 1, revenue: 4, transactions: 1 },
  ]);
  expect(sortSales(rows, 'total-desc').map(row => row.totalAmount)).toEqual([30, 24.7, 4]);
  expect(rows[0].totalAmount).toBe(24.7);
});

test('Sale entry validates inline, accepts decimal prices, deducts stock once, and refreshes availability', async ({ page, request, account }) => {
  const session = await register(request, account, 'GROCERY');
  const product = await create(request, session, '/products', productData({ quantity: 10 }));
  await restore(page, session); await page.goto('/sales');
  await expect(page.getByText('No sales found.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record Sale', exact: true }).click();
  await expect(page.getByLabel('Total', { exact: true })).toHaveValue('—');
  await page.getByRole('button', { name: 'Save Sale', exact: true }).click();
  await expect(page.getByLabel('Product', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Product', { exact: true }).selectOption(product._id);
  await expect(page.locator('.sale-availability')).toContainText('10 units');
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('12.35');
  await page.getByLabel('Quantity', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Save Sale', exact: true }).click();
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await expect(page.getByLabel('Total', { exact: true })).toHaveValue('₹24.70');
  let release; const gate = new Promise(resolve => { release = resolve; }); let posted = 0;
  await page.route('**/api/sales', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posted++; await gate; await route.continue();
  });
  await page.getByRole('dialog').locator('form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect.poll(() => posted).toBe(1); await expect(page.getByLabel('Quantity', { exact: true })).toBeDisabled();
  release(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.sales-history-panel tbody tr')).toHaveCount(1);
  expect((await get(request, session, '/sales'))).toHaveLength(1);
  expect((await get(request, session, '/products/' + product._id)).quantity).toBe(8);
  expect((await get(request, session, '/inventory/transactions')).filter(row => row.type === 'STOCK_OUT')).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Record Sale', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Record Sale', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Record Sale', exact: true }).click();
  await page.getByLabel('Product', { exact: true }).selectOption(product._id);
  await expect(page.locator('.sale-availability')).toContainText('8 units');
});

test('Sales dates reach the existing API, with record pagination, SKU search, sorting, and clear invalid ranges', async ({ page, request, account }) => {
  const session = await register(request, account, 'CLOTHING');
  const product = await create(request, session, '/products', productData({ fashionType: 'OLD_FASHION' }));
  for (let i = 0; i < 23; i++) await create(request, session, '/sales', {
    product: product._id, quantity: 1, sellingPrice: i + 1, date: i < 21 ? '2001-01-10' : '2001-02-10',
  });
  await restore(page, session); await page.goto('/sales');
  const panel = page.locator('.sales-history-panel');
  await expect(panel.locator('tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: 'Next sales page' }).click();
  await expect(panel.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('Sort sales').selectOption('total-desc');
  await expect(panel.locator('tbody tr').first()).toContainText('₹23.00');
  await page.getByLabel('Search sales').fill('SALE-UI'); await expect(panel.locator('tbody tr')).toHaveCount(20);
  await page.getByLabel('Search sales').fill('no matches'); await expect(page.getByText('No sales found.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByLabel('From date').fill('2001-02-10'); await page.getByLabel('To date').fill('2001-01-10');
  await page.getByRole('button', { name: 'Apply dates' }).click();
  await expect(page.getByRole('alert')).toContainText('Start date must be on or before');
  await page.getByLabel('To date').fill('2001-02-10');
  const response = page.waitForResponse(res => res.url().includes('/api/sales?') && res.url().includes('from=2001-02-10'));
  await page.getByRole('button', { name: 'Apply dates' }).click(); expect((await response).ok()).toBeTruthy();
  await expect(panel.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('.stats').getByText('₹45.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset dates' }).click(); await expect(panel.locator('tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: 'Record Sale', exact: true }).click();
  await page.getByLabel('Product', { exact: true }).selectOption(product._id);
  await expect(page.locator('.sale-availability')).toContainText('Old Fashion');
  await expect(page.locator('.sale-availability')).not.toContainText('Expiry');
});

test('Reports keep calendar summaries separate from dated history and show actual product revenue', async ({ page, request, account }) => {
  const session = await register(request, account, 'MEDICAL');
  const first = await create(request, session, '/products', productData());
  const second = await create(request, session, '/products', productData({ sku: 'SALE-SECOND' }));
  await create(request, session, '/sales', { product: first._id, quantity: 2, date: '2001-01-10' });
  await create(request, session, '/sales', { product: second._id, quantity: 3, date: '2001-01-11' });
  await restore(page, session); await page.goto('/reports');
  await expect(page.getByText('No dated sales in this range. Record sales or choose another date range to see a trend.')).toBeVisible();
  await expect(page.locator('.report-overview canvas')).toHaveCount(2);
  for (const period of ['daily', 'weekly', 'monthly']) expect((await get(request, session, '/reports/' + period)).totalSales).toBe(0);
  await page.getByLabel('From date').fill('2001-01-10'); await page.getByLabel('To date').fill('2001-01-11');
  await page.getByRole('button', { name: 'Apply dates' }).click();
  await expect(page.getByRole('img', { name: 'Historical recorded sales revenue', exact: true })).toBeVisible();
  await expect(page.locator('.historical-sales-panel .stats').getByText('₹61.75', { exact: true })).toBeVisible();
  const rows = page.locator('.performance-panel tbody tr');
  await expect(rows).toHaveCount(2); await expect(rows.first()).toContainText('SALE-SECOND'); await expect(rows.first()).toContainText('₹37.05');
  await expect(page.locator('.reports .report').filter({ hasText: 'Daily Sales' }).locator('.stat-value')).toHaveText('₹0.00');
  await expect(page.locator('.chart-note').first()).toContainText('2 recorded sale days');
  await page.getByLabel('From date').fill('2002-01-01'); await page.getByLabel('To date').fill('2002-01-02');
  await page.getByRole('button', { name: 'Apply dates' }).click();
  await expect(page.getByRole('img', { name: 'Historical recorded sales revenue', exact: true })).toHaveCount(0);
  await expect(page.getByText('No product sales recorded in this range.')).toBeVisible();
});

test('AI cards display actual fallback/no-sales guidance and Clothing requests no expiry alerts', async ({ page, request, account }) => {
  const session = await register(request, account, 'CLOTHING');
  await create(request, session, '/products', productData({ quantity: 0, fashionType: 'NEW_FASHION' }));
  const expiryRequests = [];
  page.on('request', req => { if (req.url().includes('/ai/expiry-alerts')) expiryRequests.push(req.url()); });
  await restore(page, session); await page.goto('/ai-recommendations');
  const response = page.waitForResponse(res => res.url().endsWith('/api/ai/reorder-suggestions'));
  await page.getByRole('button', { name: 'Generate AI Recommendations', exact: true }).click();
  const result = await (await response).json(); expect(result.source).toBe('RULE_BASED'); expect(result.suggestions).toHaveLength(1);
  const row = result.suggestions[0], card = page.getByRole('article', { name: 'Recommendation for ' + row.productName, exact: true });
  await expect(card).toBeVisible(); await expect(card.locator('.purchase-estimate strong')).toContainText(String(row.suggestedReorderQuantity));
  await expect(card).toContainText(row.reason); await expect(card).toContainText(row.demandObservation);
  await expect(card).toContainText('No daily demand recorded');
  await expect(card.locator('dd').first()).toHaveText(String(row.currentStock));
  await expect(card.getByRole('link', { name: 'Manage stock' })).toHaveAttribute('href', '/inventory');
  await expect(page.getByRole('heading', { name: /Expiry warnings/ })).toHaveCount(0);
  expect(expiryRequests).toEqual([]);
});

test('AI errors, rate limits, omitted fields, informational results, empty output, and busy locks are explicit', async ({ page, request, account }) => {
  const session = await register(request, account, 'CLOTHING'); await restore(page, session);
  let mode = '429', requests = 0, release; const gate = new Promise(resolve => { release = resolve; });
  // Fault injection is limited to the test; no application data or provider behavior is replaced.
  await page.route('**/api/ai/reorder-suggestions', async route => {
    requests++;
    if (mode === '429') return route.fulfill({ status: 429, json: { message: 'Rate limit test' } });
    if (mode === '500') return route.fulfill({ status: 500, json: { message: 'Unavailable test' } });
    if (mode === 'invalid') return route.fulfill({ json: { source: 'GEMINI', suggestions: [{ productName: 'Broken', suggestedReorderQuantity: 'invalid', reason: 'Broken' }] } });
    if (mode === 'held') await gate;
    if (mode === 'empty') return route.fulfill({ json: { source: 'RULE_BASED', suggestions: [] } });
    return route.fulfill({ json: { source: 'RULE_BASED', suggestions: [{ productName: 'Contract optional fields probe', suggestedReorderQuantity: 0, reason: 'Informational contract probe.' }] } });
  });
  await page.goto('/ai-recommendations');
  await page.getByRole('button', { name: 'Generate AI Recommendations', exact: true }).click();
  await expect(page.getByText('Recommendation requests are rate limited. Please wait before retrying.')).toBeVisible();
  await expect(page.locator('.recommendation-panel [role=alert]')).toContainText('Too many requests');
  mode = '500'; await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Recommendations could not be refreshed.')).toBeVisible();
  mode = 'invalid'; await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.recommendation-panel [role=alert]')).toContainText(/invalid/i);
  mode = 'held'; const prior = requests;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Analyzing...', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Refresh', exact: true }).evaluate(button => { button.click(); button.click(); });
  expect(requests).toBe(prior + 1); release();
  const card = page.getByRole('article', { name: 'Recommendation for Contract optional fields probe', exact: true });
  await expect(card).toBeVisible(); await expect(card).toContainText('Informational recommendation');
  await expect(card.locator('dd')).toHaveText(['Not provided', 'Not provided']);
  await expect(page.getByText('Generated with Gemini using your inventory and sales data.')).toHaveCount(0);
  mode = 'empty'; await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('No reorder suggestions were returned. Review stock and recorded sales before purchasing.')).toBeVisible();
  await expect(page.locator('.recommendation-grid article')).toHaveCount(0);
});

test('AI expiry warnings retain no-sales state and one persistent dismissal shared with Dashboard', async ({ page, request, account }) => {
  const session = await register(request, account, 'GROCERY');
  const expires = new Date(); expires.setUTCDate(expires.getUTCDate() + 1);
  const product = await create(request, session, '/products', productData({ expiryDate: expires.toISOString().slice(0, 10) }));
  await restore(page, session); await page.goto('/ai-recommendations');
  const warning = page.getByRole('article', { name: 'Expiry warning for ' + product.name, exact: true });
  await expect(warning).toHaveCount(1);
  await expect(warning).toContainText('Not enough data');
  await expect(warning).toContainText('seven days after expiry');
  await warning.getByRole('button', { name: 'Dismiss warning' }).click();
  await expect(warning).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByText('No active expiry warnings.')).toBeVisible();
  expect((await get(request, session, '/ai/expiry-alerts')).alerts).toHaveLength(0);
});

test('Sales and report resources show loading, errors, retries, and successful empty states', async ({ page, request, account }) => {
  const session = await register(request, account, 'CLOTHING'); await restore(page, session);
  let release; const gate = new Promise(resolve => { release = resolve; }); let mode = 'held';
  await page.route('**/api/sales?*', async route => {
    if (mode === 'held') await gate;
    if (mode === 'empty') return route.continue();
    return route.fulfill({ status: 503, json: { message: 'History unavailable test' } });
  });
  await page.goto('/sales'); await expect(page.locator('.sales-history-panel')).toContainText('Loading...');
  release(); await expect(page.locator('.sales-history-panel [role=alert]')).toBeVisible();
  mode = 'empty'; await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('No sales found.', { exact: true })).toBeVisible();
  await page.route('**/api/reports/daily', route => route.fulfill({ status: 503, json: { message: 'Overview unavailable test' } }));
  await page.goto('/reports'); await expect(page.locator('.report-overview [role=alert]').first()).toBeVisible();
  await expect(page.locator('.reports .report').first().locator('.stat-value')).toHaveText('—');
  await page.unroute('**/api/reports/daily');
  await page.locator('.report-overview').getByRole('button', { name: 'Try again', exact: true }).first().click();
  await expect(page.getByRole('img', { name: 'Daily, weekly and monthly sales', exact: true })).toBeVisible();
  await expect(page.getByText('Add products to see stock health.')).toBeVisible();
});

test('Sales, Reports, AI cards and sale dialogs fit mobile, tablet, and desktop widths using real records', async ({ page, request, account }) => {
  const session = await register(request, account, 'RESTAURANT');
  const product = await create(request, session, '/products', productData({ quantity: 5, minimumStock: 5, name: 'A deliberately long restaurant product name for responsive layout verification' }));
  await create(request, session, '/sales', { product: product._id, quantity: 1 });
  await restore(page, session);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/sales', '/reports', '/ai-recommendations']) {
      await page.goto(path);
      if (path === '/sales') await expect(page.locator('.sales-history-panel tbody tr').first()).toContainText(product.name);
      if (path === '/reports') await expect(page.getByRole('img', { name: 'Historical recorded sales revenue', exact: true })).toBeVisible();
      if (path === '/ai-recommendations') {
        await page.getByRole('button', { name: 'Generate AI Recommendations', exact: true }).click();
        await expect(page.getByRole('article', { name: 'Recommendation for ' + product.name, exact: true })).toBeVisible();
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      if (path === '/sales') {
        await page.getByRole('button', { name: 'Record Sale', exact: true }).click();
        await page.getByLabel('Product', { exact: true }).selectOption(product._id);
        const box = await page.getByRole('dialog').boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
        await page.keyboard.press('Escape');
      }
    }
  }
  expect(errors).toEqual([]);
});
