import { test, expect, register, withDatabase, ObjectId } from './fixtures.js';

const baseProduct = { name: 'Store type verification product', sku: 'STORE-VERIFY', sellingPrice: 20, quantity: 5, minimumStock: 1 };
const baseUrl = 'http://localhost:5000/api';

test('Unselected retailers and stale sessions use the authenticated shop data', async ({ page, request, account }) => {
  const session = await register(request, account);
  const noShop = await request.post(`${baseUrl}/products`, { headers: session.headers, data: baseProduct });
  expect(noShop.status()).toBe(400);
  expect((await noShop.json()).message).toContain('Select a shop type');
  const invalid = await request.put(`${baseUrl}/auth/shop-type`, { headers: session.headers, data: { shopType: 'OTHER' } });
  expect(invalid.status()).toBe(400);
  const profile = await request.get(`${baseUrl}/auth/shop-type`, { headers: session.headers });
  expect((await profile.json()).user.shopType).toBeNull();

  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ ...user, shopType: 'GROCERY' }));
    localStorage.setItem('shopType', 'GROCERY');
  }, session);
  await page.goto('/products');
  await expect(page).toHaveURL(/shop-selection$/);
  const selected = await request.put(`${baseUrl}/auth/shop-type`, { headers: session.headers, data: { shopType: 'RESTAURANT' } });
  expect(selected.status()).toBe(200);
  await page.goto('/products');
  await expect(page.locator('.top strong')).toHaveText('Restaurant');
  await page.getByRole('button', { name: 'Add Product' }).click();
  await expect(page.getByLabel('Expiry Date')).toBeVisible();
  await expect(page.getByLabel('Fashion', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Category', { exact: true })).toHaveJSProperty('tagName', 'INPUT');
});

test('Clothing API validates fashion and never uses expiry, including legacy dates', async ({ request, account }) => {
  const { headers, user } = await register(request, account, 'CLOTHING');
  for (const extra of [{}, { fashionType: 'UNKNOWN' }, { fashionType: 'OLD_FASHION', shopType: 'MEDICAL' }]) {
    const invalid = await request.post(`${baseUrl}/products`, { headers, data: { ...baseProduct, ...extra } });
    expect(invalid.status()).toBe(400);
  }
  const created = await request.post(`${baseUrl}/products`, { headers, data: { ...baseProduct, fashionType: 'OLD_FASHION', expiryDate: 'not-a-date' } });
  expect(created.status()).toBe(201);
  const product = await created.json();
  expect(product.shopType).toBe('CLOTHING'); expect(product.expiryDate).toBeNull();
  const invalidEdit = await request.put(`${baseUrl}/products/${product._id}`, { headers, data: { fashionType: 'UNKNOWN' } });
  expect(invalidEdit.status()).toBe(400);
  const unchanged = await request.get(`${baseUrl}/products/${product._id}`, { headers });
  expect((await unchanged.json()).fashionType).toBe('OLD_FASHION');
  const edited = await request.put(`${baseUrl}/products/${product._id}`, { headers, data: { fashionType: 'NEW_FASHION', expiryDate: '2000-01-01' } });
  expect(edited.status()).toBe(200);
  expect((await edited.json()).expiryDate).toBeNull();

  // A legacy date is inserted only on this temporary test-owned product to
  // verify that stock, sales and reports do not apply expiry rules to Clothing.
  await withDatabase(db => db.collection('products').updateOne({ _id: new ObjectId(product._id), createdBy: new ObjectId(user._id) }, { $set: { expiryDate: new Date('2000-01-01') } }));
  const sale = await request.post(`${baseUrl}/sales`, { headers, data: { product: product._id, quantity: 1 } });
  expect(sale.status()).toBe(201);
  const expiry = await request.get(`${baseUrl}/reports/expiry`, { headers });
  expect(await expiry.json()).toEqual({ expired: [], expiringSoon: [] });
  const dashboard = await request.get(`${baseUrl}/reports/dashboard`, { headers });
  expect((await dashboard.json()).expiringCount).toBe(0);
  const normalized = await request.put(`${baseUrl}/products/${product._id}`, { headers, data: { description: 'Verified clothing legacy compatibility' } });
  expect(normalized.status()).toBe(200);
  const normalizedProduct = await normalized.json();
  expect(normalizedProduct.expiryDate).toBeNull(); expect(normalizedProduct.fashionType).toBe('NEW_FASHION'); expect(normalizedProduct.quantity).toBe(4);
});

test('Restaurant API preserves optional expiry and blocks incompatible store changes', async ({ request, account }) => {
  const { headers } = await register(request, account, 'RESTAURANT');
  const created = await request.post(`${baseUrl}/products`, { headers, data: baseProduct });
  expect(created.status()).toBe(201);
  const product = await created.json();
  expect(product.expiryDate).toBeNull(); expect(product.fashionType).toBeNull();
  for (const invalid of [{ expiryDate: 'not-a-date' }, { fashionType: 'NEW_FASHION' }, { shopType: 'CLOTHING' }]) {
    const response = await request.put(`${baseUrl}/products/${product._id}`, { headers, data: invalid });
    expect(response.status()).toBe(400);
  }
  const supplier = await request.post(`${baseUrl}/suppliers`, { headers, data: { name: 'Store type verification supplier' } });
  expect(supplier.status()).toBe(201);
  const supplierId = (await supplier.json())._id;
  const change = () => request.put(`${baseUrl}/auth/shop-type`, { headers, data: { shopType: 'CLOTHING' } });
  expect((await change()).status()).toBe(409);
  const refreshed = await request.get(`${baseUrl}/auth/shop-type`, { headers });
  expect((await refreshed.json()).user.shopType).toBe('RESTAURANT');
  expect((await request.delete(`${baseUrl}/products/${product._id}`, { headers })).status()).toBe(200);
  expect((await change()).status()).toBe(409); // Supplier ownership also prevents conversion.
  expect((await request.delete(`${baseUrl}/suppliers/${supplierId}`, { headers })).status()).toBe(200);
  const allowed = await change();
  expect(allowed.status()).toBe(200);
  expect((await allowed.json()).user.shopType).toBe('CLOTHING');
});

test('Store-specific products and suppliers retain retailer ownership isolation', async ({ request, account }) => {
  const first = await register(request, account, 'GROCERY');
  const other = { name: `${account.name} other`, email: account.email.replace('@', '-other@'), password: account.password };
  account.additional.push(other);
  const second = await register(request, other, 'CLOTHING');
  const supplier = await request.post(`${baseUrl}/suppliers`, { headers: second.headers, data: { name: 'Other verification supplier' } });
  expect(supplier.status()).toBe(201);
  const supplierId = (await supplier.json())._id;
  const foreignSupplier = await request.post(`${baseUrl}/products`, { headers: first.headers, data: { ...baseProduct, supplier: supplierId } });
  expect(foreignSupplier.status()).toBe(404);
  const created = await request.post(`${baseUrl}/products`, { headers: first.headers, data: baseProduct });
  expect(created.status()).toBe(201);
  const productId = (await created.json())._id;
  for (const method of ['get', 'put', 'delete']) {
    const response = await request[method](`${baseUrl}/products/${productId}`, { headers: second.headers, ...(method === 'put' ? { data: { fashionType: 'OLD_FASHION' } } : {}) });
    expect(response.status()).toBe(404);
  }
  const stock = await request.post(`${baseUrl}/inventory/stock-out`, { headers: second.headers, data: { product: productId, quantity: 1 } });
  expect(stock.status()).toBe(404);
  const sale = await request.post(`${baseUrl}/sales`, { headers: second.headers, data: { product: productId, quantity: 1 } });
  expect(sale.status()).toBe(404);
  const own = await request.get(`${baseUrl}/products/${productId}`, { headers: first.headers });
  expect((await own.json()).quantity).toBe(5);
});
