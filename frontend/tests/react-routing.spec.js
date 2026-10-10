import { test, expect, register } from './fixtures.js';

async function proveReact(page, requests) {
  expect(await page.locator('#root').evaluate(root => Object.keys(root).some(key => key.startsWith('__reactContainer$')))).toBeTruthy();
  expect(requests.some(url => /\/js\/(?:auth|common|config|dashboard|products|inventory|sales|suppliers|reports|ai-recommendations|shop-selection)\.js(?:\?|$)/.test(url))).toBeFalsy();
  expect(requests.some(url => /\/src\/main\.jsx|\/assets\/index-[^/]+\.js/.test(url))).toBeTruthy();
}

for (const width of [1280, 390]) {
  test(`${width}px: React register/login validation, loading, backend errors and session navigation`, async ({ page, account }) => {
    await page.setViewportSize({ width, height: 844 });
    const requests = [], errors = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Create account', exact: true })).toBeVisible();
    await proveReact(page, requests);
    const email = page.getByLabel('Email', { exact: true });
    expect(await email.evaluate(input => Object.entries(input).some(([key, value]) => key.startsWith('__reactProps$') && typeof value.onChange === 'function'))).toBeTruthy();
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    expect(await page.locator('form').evaluate(form => form.checkValidity())).toBeFalsy();
    await page.getByLabel('Name', { exact: true }).fill(account.name);
    await email.fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByLabel('Confirm Password').fill('mismatch');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Passwords do not match');
    await page.getByLabel('Confirm Password').fill(account.password);
    await page.getByRole('checkbox',{name:'Grocery Store',exact:true}).check();
    if (width === 390) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.screenshot({ path: 'test-results/react-register-mobile.png' });
    }
    // Delay delivery to the actual API, without mocking the backend response.
    await page.route('**/api/auth/register', async route => { await new Promise(resolve => setTimeout(resolve, 600)); await route.continue(); });
    const registered = page.waitForResponse(response => response.url().endsWith('/api/auth/register') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Creating...', exact: true })).toBeDisabled();
    expect((await registered).status()).toBe(201);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.unroute('**/api/auth/register');
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    if (width === 390) await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Logout', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid');
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.route('**/api/auth/login', async route => { await new Promise(resolve => setTimeout(resolve, 600)); await route.continue(); });
    const loggedIn = page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Logging in...', exact: true })).toBeDisabled();
    expect((await loggedIn).status()).toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/register');
    for (const [label, value] of [['Name', account.name], ['Email', account.email], ['Password', account.password], ['Confirm Password', account.password]]) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole('checkbox',{name:'Grocery Store',exact:true}).check();
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/already|exists/i);
    await proveReact(page, requests);
    expect(errors).toEqual([]);
  });
}

test('Every clean route survives direct entry/reload; every old HTML URL redirects to React', async ({ page, request, account }) => {
  const session = await register(request, account, 'GROCERY');
  await page.goto('/');
  await page.evaluate(session => {
    localStorage.setItem('token', session.token);
    localStorage.setItem('user', JSON.stringify(session.user));
  }, session);
  const pages = [
    ['index.html', '/', 'Run your shop with clarity.'],
    ['login.html', '/login', 'Login'], ['register.html', '/register', 'Create account'],
    ['shop-selection.html', '/shop-selection', 'Select your shop'],
    ['dashboard.html', '/dashboard', 'Dashboard'], ['products.html', '/products', 'Products'],
    ['suppliers.html', '/suppliers', 'Suppliers'], ['inventory.html', '/inventory', 'Inventory'],
    ['sales.html', '/sales', 'Sales'], ['reports.html', '/reports', 'Reports'],
    ['ai-recommendations.html', '/ai-recommendations', 'AI Reorder Recommendations'],
  ];
  const requests = [], errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  for (const [old, route, heading] of pages) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    const response = await request.get(`/${old}?source=bookmark`, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe(`${route}?source=bookmark`);
    await page.goto(`/${old}?source=bookmark#saved`);
    await expect(page).toHaveURL(`http://localhost:5500${route}?source=bookmark#saved`);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await proveReact(page, requests);
  }
  // Also prove the React fallback redirects when the static host serves index.html.
  await page.evaluate(() => { history.pushState({}, '', '/register.html?from=static#form'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page).toHaveURL('http://localhost:5500/register?from=static#form');
  await expect(page.getByRole('heading', { name: 'Create account', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
