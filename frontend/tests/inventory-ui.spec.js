import { test, expect, register } from './fixtures.js';
import { formatSalesDay, salesByDay, summarizeStock } from '../src/utils/inventoryView.js';

const base = 'http://localhost:5000/api';
async function create(request, session, route, data) {
  const response = await request.post(`${base}${route}`, { headers: session.headers, data });
  expect(response.status()).toBe(201);
  return response.json();
}
async function read(request, session, route) {
  const response = await request.get(`${base}${route}`, { headers: session.headers });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function restore(page, session) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
  }, { token: session.token, user: session.user });
}

test('View summaries honor threshold equality and UTC sales boundaries without filling missing dates', () => {
  expect(formatSalesDay('2026-10-01')).toBe('1 Oct');
  expect(formatSalesDay('2026-10-03T04:00:00+05:30')).toBe('2 Oct');
  expect(summarizeStock([{ quantity: 0, minimumStock: 0 }, { quantity: 5, minimumStock: 5 }, { quantity: 6, minimumStock: 5 }]))
    .toEqual({ healthy: 1, low: 1, out: 1, units: 11 });
  const rows = [{ date: '2026-10-01T00:00:00Z', totalAmount: 12.5 }, { date: '2026-10-01T23:59:00Z', totalAmount: 7.5 },
    { date: '2026-10-03T04:00:00+05:30', totalAmount: 5 }, { date: '2026-09-30T23:59:00Z', totalAmount: 99 },
    { date: '2026-10-04T00:00:00Z', totalAmount: 99 }, { date: null, totalAmount: 99 }];
  expect(salesByDay(rows, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-03T23:59:59Z')))
    .toEqual([['2026-10-01', 20], ['2026-10-02', 5]]);
  expect(salesByDay([], new Date('2026-10-01'), new Date('2026-10-04'))).toEqual([]);
});

test('Products paginate, sort, combine filters, save decimal prices, and retain delete confirmation', async ({ page, request, account }) => {
  const session = await register(request, account, 'GROCERY');
  const supplier = await create(request, session, '/suppliers', { name: 'UI test distributor', company: 'UI test company' });
  const products = await Promise.all(Array.from({ length: 26 }, (_, index) => create(request, session, '/products', {
    name: `Managed item ${String(index + 1).padStart(2, '0')}`, sku: `UI-${index + 1}`, quantity: index, minimumStock: 5,
    sellingPrice: index + 2.35, purchasePrice: 1.25, supplier: supplier._id, category: index % 2 ? 'Beverages' : 'Food Products',
  })));
  await restore(page, session); await page.goto('/products');
  const panel = page.locator('.products-panel');
  await expect(panel.locator('tbody tr')).toHaveCount(20);
  await page.getByLabel('Sort products').selectOption('name');
  await expect(panel.locator('tbody tr').first()).toContainText('Managed item 01');
  await page.getByRole('button', { name: 'Next products page' }).click();
  await expect(panel.locator('tbody tr')).toHaveCount(6);
  await expect(panel.locator('tbody tr').first()).toContainText('Managed item 21');
  await page.getByLabel('Filter stock status').selectOption('warn');
  const expectedLow = products.filter(product => product.quantity > 0 && product.quantity <= product.minimumStock);
  await expect(panel.locator('tbody tr')).toHaveCount(expectedLow.length);
  await page.getByLabel('Filter category').selectOption('Beverages');
  await expect(panel.locator('tbody tr')).toHaveCount(expectedLow.filter(product => product.category === 'Beverages').length);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Sort products').selectOption('price-desc');
  await expect(panel.locator('tbody tr').first()).toContainText('Managed item 26');
  await page.getByLabel('Search product or SKU').fill('UI-26');
  const row = panel.getByRole('row').filter({ hasText: 'Managed item 26' });
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Expiry Date')).not.toHaveAttribute('required');
  await page.getByLabel('Selling Price').fill('12.35');
  await page.getByLabel('Description').fill('Updated through the real product endpoint');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Product', exact: true })).toBeFocused();
  const saved = await read(request, session, `/products/${products[25]._id}`);
  expect(saved.sellingPrice).toBe(12.35); expect(saved.purchasePrice).toBe(1.25); expect(saved.expiryDate).toBeNull();
  page.once('dialog', dialog => dialog.dismiss()); await row.getByRole('button', { name: 'Delete' }).click();
  await expect(row).toBeVisible(); expect((await read(request, session, '/products')).length).toBe(products.length);
  page.once('dialog', dialog => dialog.accept()); await row.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No products found.', { exact: true })).toBeVisible();
  expect((await read(request, session, '/products')).length).toBe(products.length - 1);
});

test('Supplier forms, contact search, edit, and confirmed deletion use real records', async ({ page, request, account }) => {
  const session = await register(request, account, 'RESTAURANT');
  await restore(page, session); await page.goto('/suppliers');
  await expect(page.getByText('No suppliers found.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Supplier' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Name', { exact: true }).fill('Regional distributor');
  await page.getByLabel('Company').fill('Regional supplies');
  await page.getByLabel('Phone').fill('+91 9876543210');
  await page.getByLabel('Email', { exact: true }).fill('supplier-ui@example.invalid');
  await page.getByLabel('Address').fill('Supplier address entered for verification');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Supplier', exact: true })).toBeFocused();
  const [supplier] = await read(request, session, '/suppliers');
  expect(supplier.name).toBe('Regional distributor');
  await page.getByLabel('Search supplier').fill(supplier.email);
  const row = page.locator('.suppliers-panel').getByRole('row').filter({ hasText: supplier.name });
  await expect(row.getByRole('link', { name: supplier.phone })).toHaveAttribute('href', `tel:${supplier.phone}`);
  await expect(row.getByRole('link', { name: supplier.email })).toHaveAttribute('href', `mailto:${encodeURIComponent(supplier.email)}`);
  await row.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Address').fill('Updated supplier address');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row).toContainText('Updated supplier address');
  page.once('dialog', dialog => dialog.dismiss()); await row.getByRole('button', { name: 'Delete' }).click(); await expect(row).toBeVisible();
  page.once('dialog', dialog => dialog.accept()); await row.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No suppliers found.', { exact: true })).toBeVisible();
  expect(await read(request, session, '/suppliers')).toEqual([]);
});

test('Stock shortcuts preserve transactions, current thresholds, and invalid-quantity handling', async ({ page, request, account }) => {
  const session = await register(request, account, 'CLOTHING');
  const product = await create(request, session, '/products', { name: 'Stock workflow item', sku: 'STOCK-UI', sellingPrice: 20, quantity: 10, minimumStock: 12, fashionType: 'OLD_FASHION' });
  await restore(page, session); await page.goto('/inventory');
  const overview = page.locator('.stock-overview'), movement = page.locator('.movement-panel');
  await expect(overview.getByRole('row').filter({ hasText: product.name })).toContainText('Low');
  await page.getByRole('button', { name: 'Stock Out', exact: true }).click();
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('STOCK_OUT');
  await page.getByLabel('Product', { exact: true }).selectOption(product._id);
  await page.getByLabel('Quantity', { exact: true }).fill('0'); await page.getByLabel('Reason').fill('Invalid stock UI quantity');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect((await read(request, session, `/products/${product._id}`)).quantity).toBe(product.quantity);
  await page.getByLabel('Quantity', { exact: true }).fill('9999'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Insufficient stock'); await page.keyboard.press('Escape');
  await overview.getByRole('button', { name: 'Adjust stock' }).click();
  await expect(page.getByLabel('Product', { exact: true })).toHaveValue(product._id);
  await page.getByLabel('Quantity', { exact: true }).fill('5'); await page.getByLabel('Reason').fill('UI received stock');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(overview.getByRole('row').filter({ hasText: product.name })).toContainText('In Stock');
  await expect(movement.getByRole('row').filter({ hasText: 'UI received stock' })).toContainText('+5');
  await page.getByRole('button', { name: 'Stock Out', exact: true }).click(); await page.getByLabel('Product', { exact: true }).selectOption(product._id);
  await page.getByLabel('Quantity', { exact: true }).fill('3'); await page.getByLabel('Reason').fill('UI removed stock');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stock Out', exact: true })).toBeFocused();
  expect((await read(request, session, `/products/${product._id}`)).quantity).toBe(12);
  await expect(overview.getByRole('row').filter({ hasText: product.name })).toContainText('Low');
  await page.getByLabel('Filter transaction type').selectOption('STOCK_OUT');
  await expect(movement.locator('tbody tr')).toHaveCount(1); await expect(movement.locator('tbody')).toContainText('−3');
  await page.getByLabel('Filter inventory stock status').selectOption('out');
  await expect(page.getByText('No stock items match your filters.')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Expiry', exact: true })).toHaveCount(0);
});

test('Dashboard uses authenticated store data and real charts, with working low-stock links', async ({ page, request, account }) => {
  const session = await register(request, account, 'GROCERY');
  const selected = await request.put(`${base}/auth/shop-type`, { headers: session.headers, data: { shopType: 'GROCERY', shopName: 'Verified UI shop' } });
  expect(selected.ok()).toBeTruthy(); session.user = (await selected.json()).user;
  const healthy = await create(request, session, '/products', { name: 'Demand history item', sku: 'DEMAND-UI', sellingPrice: 12.35, quantity: 30, minimumStock: 2 });
  await create(request, session, '/products', { name: 'Threshold item', sku: 'LOW-UI', sellingPrice: 10, quantity: 3, minimumStock: 3 });
  await create(request, session, '/products', { name: 'Empty stock item', sku: 'OUT-UI', sellingPrice: 10, quantity: 0, minimumStock: 3 });
  await create(request, session, '/sales', { product: healthy._id, quantity: 2 });
  await create(request, session, '/sales', { product: healthy._id, quantity: 3 });
  const report = await read(request, session, '/reports/dashboard');
  await restore(page, session); await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: `Welcome back, ${account.name}.` })).toBeVisible();
  await expect(page.locator('.welcome-banner')).toContainText(session.user.shopName);
  await expect(page.locator('.stat').filter({ hasText: 'Total Products' }).locator('strong')).toHaveText(String(report.totalProducts));
  await expect(page.locator('.stat').filter({ hasText: 'Low Stock' }).locator('strong')).toHaveText(String(report.lowStockCount));
  await expect(page.getByRole('img', { name: 'Recent sales totals', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Current product stock health', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Review low stock', exact: true }).click();
  await expect(page.getByLabel('Filter stock status')).toHaveValue('warn');
  await expect(page.locator('.products-panel tbody tr')).toHaveCount(1);
  await expect(page.locator('.products-panel tbody')).toContainText('Threshold item');
  await page.setViewportSize({ width: 320, height: 900 });
  for (const route of ['/dashboard', '/products', '/suppliers', '/inventory']) {
    await page.goto(route); await expect(page.locator('.head h1')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test('Record loading, failures, and retry are distinct, while optional chart failure preserves totals', async ({ page, request, account }) => {
  const session = await register(request, account, 'MEDICAL');
  await create(request, session, '/products', { name: 'Loading verification item', sku: 'LOADING-UI', sellingPrice: 5, quantity: 5, minimumStock: 1 });
  await restore(page, session);
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/products', async route => { await gate; await route.continue(); });
  await page.goto('/products'); await expect(page.locator('.products-panel').getByRole('status')).toHaveText('Loading...');
  release(); await expect(page.locator('.products-panel tbody')).toContainText('Loading verification item');
  await page.unroute('**/api/products');
  await page.route('**/api/products', route => route.abort('failed'));
  await page.reload(); await expect(page.locator('.products-panel').getByRole('alert')).toContainText('Cannot connect');
  await expect(page.getByText('No products found.', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/products'); await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.products-panel tbody')).toContainText('Loading verification item');
  await page.route('**/api/sales?**', route => route.abort('failed'));
  await page.goto('/dashboard');
  await expect(page.locator('.stat').filter({ hasText: 'Total Products' }).locator('strong')).toHaveText('1');
  const salesPanel = page.locator('.dashboard-analytics .panel').first();
  await expect(salesPanel.getByRole('alert')).toContainText('Cannot connect');
  await page.unroute('**/api/sales?**'); await salesPanel.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No recorded sales in this period.', { exact: true })).toBeVisible();
});
