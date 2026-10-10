import { test, expect } from './fixtures.js';

test('public pages and protected URLs render through React', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Run your shop with clarity.' })).toBeVisible();
  await page.getByRole('link', { name: 'Create Account' }).click();
  await expect(page.getByRole('heading', { name: 'Create account', exact: true })).toBeVisible();
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await page.goto('/products');
  await expect(page).toHaveURL(/login$/);
  expect(errors).toEqual([]);
});

for (const shopType of ['GROCERY', 'MEDICAL', 'RESTAURANT', 'CLOTHING']) {
  test(`${shopType}: existing authenticated inventory journey`, async ({ page, account }) => {
    const runtimeErrors = [], unexpectedConsoleErrors = [], missingAssets = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !/Failed to load resource:.*(?:400|401|409)/.test(message.text())) unexpectedConsoleErrors.push(message.text());
    });
    page.on('response', response => {
      if (response.status() >= 400 && /\.(js|jsx|css|png|svg|ico)(?:\?|$)/.test(response.url())) missingAssets.push(response.url());
    });
    const api = async path => {
      const token = await page.evaluate(() => localStorage.getItem('token'));
      const response = await page.request.get(`http://localhost:5000/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(response.ok(), path).toBeTruthy();
      return response.json();
    };
    const nav = async (label, heading = label) => {
      await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    };
    const productName = `Migration verification product ${shopType}`;
    const supplierName = `Migration verification supplier ${shopType}`;
    const clothing = shopType === 'CLOTHING';
    const shopLabels = { MEDICAL: 'Medical Store', RESTAURANT: 'Restaurant', GROCERY: 'Grocery Store', CLOTHING: 'Clothing Store' };

    await page.goto('/register');
    await page.getByLabel('Name', { exact: true }).fill(account.name);
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByLabel('Confirm Password').fill('different-password');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Passwords do not match');
    await page.getByLabel('Confirm Password').fill(account.password);
    await page.getByRole('checkbox', {name:shopLabels[shopType],exact:true}).check();
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page).toHaveURL(/dashboard$/);
    await expect(page.getByText('No sales yet.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page.locator('.top strong')).toHaveText(shopLabels[shopType]);
    if (clothing) await expect(page.getByText('Expiring', { exact: true })).toHaveCount(0);

    await nav('AI Recommendations', 'AI Reorder Recommendations');
    await expect(page.getByText('Click Generate AI Recommendations to analyze your current inventory.')).toBeVisible();
    await page.getByRole('button', { name: 'Generate AI Recommendations', exact: true }).click();
    await expect(page.getByText('Add products and sales data to generate recommendations.')).toBeVisible();

    await nav('Suppliers');
    await expect(page.getByText('No suppliers found.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add Supplier' }).click();
    await page.getByLabel('Name', { exact: true }).fill(supplierName);
    await page.getByLabel('Company').fill('Verification company');
    await page.getByLabel('Email', { exact: true }).fill('verification@example.invalid');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    let row = page.getByRole('row').filter({ hasText: supplierName });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Company').fill('Updated verification company');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(row).toContainText('Updated verification company');

    await nav('Products');
    await expect(page.getByText('No products found.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add Product', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(productName);
    await page.getByLabel('SKU', { exact: true }).fill(`VERIFY-${shopType}`);
    if (['MEDICAL', 'GROCERY'].includes(shopType)) {
      await expect(page.getByLabel('Category', { exact: true })).toHaveValue(shopType === 'MEDICAL' ? 'Tablets' : 'Food Products');
    } else {
      await expect(page.getByLabel('Category', { exact: true })).toHaveValue('');
      await page.getByLabel('Category', { exact: true }).fill('Verification category');
    }
    await page.getByLabel('Purchase Price').fill('10');
    await page.getByLabel('Selling Price').fill('20');
    await page.getByLabel('Quantity', { exact: true }).fill('10');
    await page.getByLabel('Minimum Stock').fill('10');
    await page.getByLabel('Supplier', { exact: true }).selectOption({ label: supplierName });
    const future = new Date(); future.setDate(future.getDate() + 2);
    if (clothing) {
      await expect(page.getByLabel('Expiry Date')).toHaveCount(0);
      const fashion = page.getByLabel('Fashion', { exact: true });
      await expect(fashion).toHaveValue('');
      expect(await fashion.evaluate(element => element.required)).toBeTruthy();
      await fashion.selectOption('NEW_FASHION');
    } else {
      expect(await page.getByLabel('Expiry Date').evaluate(element => element.required)).toBeFalsy();
      await page.getByLabel('Expiry Date').fill(future.toISOString().slice(0, 10));
    }
    const createResponse = page.waitForResponse(response => response.url().endsWith('/api/products') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const sent = (await createResponse).request().postDataJSON();
    if (clothing) { expect(sent).not.toHaveProperty('expiryDate'); expect(sent.fashionType).toBe('NEW_FASHION'); }
    else expect(sent).not.toHaveProperty('fashionType');
    row = page.getByRole('row').filter({ hasText: productName });
    await expect(row).toContainText('Low');
    if (clothing) {
      await expect(row).toContainText('New Fashion');
      await expect(page.getByRole('columnheader', { name: 'Expiry', exact: true })).toHaveCount(0);
    }
    await row.getByRole('button', { name: 'Edit' }).click();
    if (clothing) {
      await expect(page.getByLabel('Expiry Date')).toHaveCount(0);
      await expect(page.getByLabel('Fashion', { exact: true })).toHaveValue('NEW_FASHION');
      await page.getByLabel('Fashion', { exact: true }).selectOption('OLD_FASHION');
    } else await expect(page.getByLabel('Expiry Date')).toHaveValue(future.toISOString().slice(0, 10));
    await page.getByLabel('Description').fill('Temporary migration verification record');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Search product or SKU').fill('not-a-matching-product');
    await expect(page.getByText('No products found.', { exact: true })).toBeVisible();
    await page.getByLabel('Search product or SKU').fill(`VERIFY-${shopType}`);
    await expect(row).toBeVisible();
    const [product] = await api('/products');
    expect(product.description).toBe('Temporary migration verification record');
    expect(product.shopType).toBe(shopType);
    if (clothing) {
      expect(product.expiryDate).toBeNull(); expect(product.fashionType).toBe('OLD_FASHION');
      await expect(row).toContainText('Old Fashion');
      await page.getByLabel('Filter fashion').selectOption('NEW_FASHION');
      await expect(page.getByText('No products found.', { exact: true })).toBeVisible();
      await page.getByLabel('Filter fashion').selectOption('OLD_FASHION');
      await expect(row).toBeVisible();
      await page.getByLabel('Filter fashion').selectOption('');
    } else { expect(product.expiryDate.slice(0, 10)).toBe(future.toISOString().slice(0, 10)); expect(product.fashionType).toBeNull(); }

    await nav('Inventory');
    for (const [type, quantity, reason] of [['STOCK_IN', '5', 'Verification stock in'], ['STOCK_OUT', '2', 'Verification stock out']]) {
      await page.getByRole('button', { name: 'Stock Transaction', exact: true }).click();
      await page.getByLabel('Product', { exact: true }).selectOption(product._id);
      await page.getByLabel('Type', { exact: true }).selectOption(type);
      await page.getByLabel('Quantity', { exact: true }).fill(quantity);
      await page.getByLabel('Reason').fill(reason);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('row').filter({ hasText: reason })).toBeVisible();
      if (clothing) await expect(page.getByRole('row').filter({ hasText: reason })).toContainText('Old Fashion');
    }
    await expect(page.getByRole('columnheader', { name: clothing ? 'Fashion' : 'Expiry', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stock Transaction', exact: true }).click();
    await page.getByLabel('Product', { exact: true }).selectOption(product._id);
    await page.getByLabel('Type', { exact: true }).selectOption('STOCK_OUT');
    await page.getByLabel('Quantity', { exact: true }).fill('9999');
    await page.getByLabel('Reason').fill('Rejected verification transaction');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Insufficient stock');
    await page.keyboard.press('Escape');
    expect((await api('/products'))[0].quantity).toBe(13);

    await nav('Sales');
    await page.getByRole('button', { name: 'Record Sale', exact: true }).click();
    await page.getByLabel('Product', { exact: true }).selectOption(product._id);
    await page.getByLabel('Quantity', { exact: true }).fill('3');
    await expect(page.getByLabel('Total', { exact: true })).toHaveValue('₹60.00');
    await page.getByRole('button', { name: 'Save Sale', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: productName })).toBeVisible();
    expect((await api('/products'))[0].quantity).toBe(10);
    const sales = await api('/sales');
    expect(sales).toHaveLength(1); expect(sales[0].totalAmount).toBe(60);

    // Existing backend rejection rules must remain visible in the React form.
    await page.getByRole('button', { name: 'Record Sale', exact: true }).click();
    await page.getByLabel('Product', { exact: true }).selectOption(product._id);
    await page.getByLabel('Quantity', { exact: true }).fill('9999');
    await page.getByRole('button', { name: 'Save Sale', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(clothing ? 'Insufficient stock' : 'Insufficient stock or product has expired');
    await page.keyboard.press('Escape');
    if (!clothing) {
      await nav('Products');
      await page.getByRole('row').filter({ hasText: productName }).getByRole('button', { name: 'Edit' }).click();
      const past = new Date(); past.setDate(past.getDate() - 1);
      await page.getByLabel('Expiry Date').fill(past.toISOString().slice(0, 10));
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await nav('Sales');
      await page.getByRole('button', { name: 'Record Sale', exact: true }).click();
      await page.getByLabel('Product', { exact: true }).selectOption(product._id);
      await page.getByLabel('Quantity', { exact: true }).fill('1');
      await page.getByRole('button', { name: 'Save Sale', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('Expired products cannot be sold');
      await page.keyboard.press('Escape');
      await nav('Reports');
      await expect(page.getByRole('row').filter({ hasText: 'Expired' })).toContainText(productName);
      await nav('Products');
      await page.getByRole('row').filter({ hasText: productName }).getByRole('button', { name: 'Edit' }).click();
      await page.getByLabel('Expiry Date').fill(future.toISOString().slice(0, 10));
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    expect((await api('/products'))[0].quantity).toBe(10);
    expect(await api('/sales')).toHaveLength(1);

    await nav('Reports');
    await expect(page.locator('canvas')).toHaveCount(3);
    await expect(page.getByRole('img', { name: 'Historical recorded sales revenue', exact: true })).toBeVisible();
    if (clothing) {
      await expect(page.getByRole('heading', { name: 'Expiry Alerts' })).toHaveCount(0);
      expect(await api('/reports/expiry')).toEqual({ expired: [], expiringSoon: [] });
    } else {
      await expect(page.getByRole('row').filter({ hasText: 'Expiring soon' })).toContainText(productName);
      expect((await api('/reports/expiry')).expiringSoon).toHaveLength(1);
    }
    expect((await api('/reports/low-stock'))).toHaveLength(1);
    await nav('Dashboard');
    await expect(page.getByRole('img', { name: 'Recent sales totals', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Current product stock health', exact: true })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(2);
    await expect(page.getByRole('row').filter({ hasText: productName })).toBeVisible();

    if (shopType === 'GROCERY') {
      await nav('AI Recommendations', 'AI Reorder Recommendations');
      const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/ai/reorder-suggestions'), { timeout: 90_000 });
      await page.getByRole('button', { name: 'Generate AI Recommendations', exact: true }).click();
      const response = await responsePromise;
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(['GEMINI', 'RULE_BASED']).toContain(result.source);
      console.log(`Verified live AI response source: ${result.source}`);
      if (result.suggestions.length) await expect(page.getByRole('article', { name: `Recommendation for ${productName}`, exact: true })).toBeVisible();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await nav('Products');
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: productName })).toBeVisible();

    await nav('Suppliers');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('row').filter({ hasText: supplierName }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No suppliers found.', { exact: true })).toBeVisible();
    expect((await api('/products'))[0].supplier).toBeNull();
    await nav('Products');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('row').filter({ hasText: productName }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No products found.', { exact: true })).toBeVisible();
    await nav('Sales');
    await expect(page.getByRole('row').filter({ hasText: 'Deleted product' })).toBeVisible();

    await page.getByRole('navigation').getByRole('link', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/login$/);
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(/dashboard$/);
    await page.evaluate(() => localStorage.setItem('token', 'expired-verification-token'));
    await page.reload();
    await expect(page).toHaveURL(/login$/);
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
    expect(runtimeErrors).toEqual([]);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(missingAssets).toEqual([]);
  });
}
