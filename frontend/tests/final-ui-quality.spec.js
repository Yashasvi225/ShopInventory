import fs from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { test, expect, register } from './fixtures.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const mongoose = requireBackend('mongoose');
const { seedDemo, cleanupDemo } = requireBackend('./demo/seed');
const base = 'http://localhost:5000/api';
const viewports = [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }];
const pages = ['dashboard', 'products', 'suppliers', 'inventory', 'sales', 'reports', 'ai-recommendations'];

async function signIn(page, email, password, destination = 'dashboard') {
  await page.goto('/login'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/' + destination + '$'));
}
async function ready(page, path) {
  if (path === 'dashboard') { await expect(page.locator('.stats .stat strong').first()).toHaveText('12'); await expect(page.locator('canvas')).toHaveCount(2); }
  if (path === 'products') await expect(page.locator('.products-panel tbody tr')).toHaveCount(12);
  if (path === 'suppliers') await expect(page.locator('.suppliers-panel tbody tr')).toHaveCount(3);
  if (path === 'inventory') { await expect(page.locator('.stock-overview tbody tr')).toHaveCount(12); await expect(page.locator('.movement-panel tbody tr')).toHaveCount(20); }
  if (path === 'sales') await expect(page.locator('.sales-history-panel tbody tr')).toHaveCount(20);
  if (path === 'reports') await expect(page.locator('canvas')).toHaveCount(3);
  if (path === 'ai-recommendations') {
    await page.getByRole('button', { name: 'Generate AI Recommendations', exact: true }).click();
    await expect(page.locator('.recommendation-card').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate AI Recommendations', exact: true })).toBeEnabled();
    await expect(page.locator('.toast')).toHaveCount(0);
  }
  await expect(page.locator('.resource-state[role=status]')).toHaveCount(0);
  await expect(page.locator('.is-loading')).toHaveCount(0);
}
async function fit(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
}
async function gallery(context, shots, width) {
  const galleryPage = await context.newPage();
  const html = '<!doctype html><html><head><title>Shop Inventory Manager visual review</title><style>body{margin:0;padding:20px;background:#eeede7;font:14px Segoe UI,Arial;color:#342d28}main{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}article{background:#fffefb;border-radius:12px;padding:12px}h2{font-size:14px;margin:0 0 10px}img{width:100%;display:block;border-radius:8px}</style></head><body><h1>All seven destinations - ' + width + 'px</h1><main>' + shots.map(({ path, image }) => '<article><h2>' + path + '</h2><img alt="' + path + ' screenshot" src="data:image/png;base64,' + image.toString('base64') + '"></article>').join('') + '</main></body></html>';
  fs.writeFileSync('test-results/quality-gallery-' + width + '.html', html);
  await galleryPage.setViewportSize({ width: 1440, height: 1100 }); await galleryPage.setContent(html);
  await galleryPage.screenshot({ path: 'test-results/quality-gallery-' + width + '.png', fullPage: true }); await galleryPage.close();
}

test('Final visual matrix: all seven destinations, public routes, dialogs, and four actual store types', async ({ page, context, request, account }) => {
  test.setTimeout(360_000);
  // Capture final chart shapes instead of an intermediate animation frame.
  // The separate motion test verifies both preferences and live preference changes.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The existing runner supplies an invocation-owned database. Never seed the application database.
  expect(process.env.NODE_ENV).toBe('test'); expect(process.env.GEMINI_API_KEY).toBe('');
  await register(request, account);
  const namespace = 'test-' + randomUUID();
  const errors = [], warnings = [], badResponses = [], measurements = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push({ text: message.text(), location: message.location() }); if (message.type() === 'warning') warnings.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) badResponses.push({ status: response.status(), path: new URL(response.url()).pathname }); });
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const seeded = await seedDemo({ namespace, password: account.password, now: new Date() });
    const grocery = seeded.dataset.owners.find(owner => owner.shopType === 'GROCERY');
    await signIn(page, grocery.email, account.password);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport); const shots = [];
      for (const path of pages) {
        await page.goto('/' + path); await ready(page, path); await fit(page);
        if (path === 'dashboard' || path === 'ai-recommendations') {
          await expect(page.locator('.expiry-list article')).toHaveCount(6);
          if (viewport.width <= 820) for (const button of await page.locator('.expiry-list .btn').all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
        }
        const metrics = await page.evaluate(() => {
          const heading = document.querySelector('.head h1'), main = document.querySelector('.content'), sidebar = document.querySelector('.sidebar');
          return { title: heading.textContent, titleSize: getComputedStyle(heading).fontSize,
            sidebarRight: sidebar.getBoundingClientRect().right, contentLeft: main.getBoundingClientRect().left,
            smallButtonHeight: document.querySelector('.row-actions button')?.getBoundingClientRect().height,
            tableOverflows: [...document.querySelectorAll('.tablewrap')].filter(table => table.scrollWidth > table.clientWidth + 1).length };
        });
        measurements.push({ path, ...viewport, ...metrics });
        if (viewport.width > 820) expect(metrics.sidebarRight).toBeLessThanOrEqual(metrics.contentLeft);
        else {
          await page.getByRole('button', { name: 'Open navigation' }).click();
          const active = page.getByRole('navigation', { name: 'Main navigation' }).locator('a.active');
          await expect(active).toBeFocused(); await expect(active).toHaveAttribute('aria-current', 'page');
          await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveCount(8);
          await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
        }
        const image = await page.screenshot({ path: 'test-results/quality-' + path + '-' + viewport.width + '.png' }); shots.push({ path, image });
        for (const chart of await page.locator('canvas').all()) {
          const box = await chart.boundingBox(); expect(box.width).toBeGreaterThan(100); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        }
        const opener = { products: 'Add Product', suppliers: 'Add Supplier', inventory: 'Stock In', sales: 'Record Sale' }[path];
        if (opener) {
          await page.getByRole('button', { name: opener, exact: true }).click(); const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
          const box = await dialog.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
          const save = dialog.getByRole('button', { name: path === 'sales' ? 'Save Sale' : 'Save', exact: true });
          await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport();
          await dialog.screenshot({ path: 'test-results/quality-' + path + '-dialog-' + viewport.width + '.png' });
          await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.getByRole('button', { name: opener, exact: true })).toBeFocused();
        }
      }
      await gallery(context, shots, viewport.width);
    }
    for (const owner of seeded.dataset.owners.filter(owner => owner.shopType !== 'GROCERY')) {
      await page.setViewportSize(viewports[0]); await signIn(page, owner.email, account.password);
      for (const path of ['products', 'reports', 'ai-recommendations']) {
        await page.goto('/' + path); await ready(page, path); await fit(page);
        if (owner.shopType === 'CLOTHING') { await expect(page.getByRole('heading', { name: /Expiry/ })).toHaveCount(0); await expect(page.locator('.expiry-list article')).toHaveCount(0); }
        else if (path === 'ai-recommendations') await expect(page.locator('.expiry-list article')).toHaveCount(6);
      }
      await page.screenshot({ path: 'test-results/quality-' + owner.shopType.toLowerCase() + '-ai-mobile.png', fullPage: true });
    }
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const path of ['/', '/login', '/register']) {
        await page.goto(path); await expect(page.locator('h1')).toBeVisible(); await fit(page);
        await page.screenshot({ path: 'test-results/quality-public-' + (path.slice(1) || 'landing') + '-' + viewport.width + '.png', fullPage: true });
      }
      await signIn(page, account.email, account.password, 'shop-selection'); await fit(page); await expect(page.locator('.choice')).toHaveCount(4);
      await page.screenshot({ path: 'test-results/quality-shop-selection-' + viewport.width + '.png', fullPage: true });
    }
    fs.writeFileSync('test-results/quality-measurements.json', JSON.stringify({ measurements, errors, warnings, badResponses }, null, 2));
    expect(errors).toEqual([]); expect(warnings).toEqual([]); expect(badResponses).toEqual([]);
  } finally {
    fs.writeFileSync('test-results/quality-measurements.json', JSON.stringify({ measurements, errors, warnings, badResponses }, null, 2));
    await cleanupDemo(namespace); await mongoose.disconnect();
  }
});

async function restore(page, session) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
  }, { token: session.token, user: session.user });
}
async function create(request, session, path, data) {
  const response = await request.post(base + path, { headers: session.headers, data }); expect(response.status()).toBe(201); return response.json();
}
async function chartStates(page) {
  return page.evaluate(async () => {
    const source = await (await fetch('/src/components/Chart.jsx')).text();
    const modulePath = source.match(/from ["']([^"']*chart[^"']*auto[^"']*)["']/)[1];
    const { default: ChartJS } = await import(modulePath);
    return [...document.querySelectorAll('canvas')].map(canvas => {
      const chart = ChartJS.getChart(canvas);
      return { label: canvas.getAttribute('aria-label'), animation: chart.config.options.animation,
        labels: chart.data.labels, values: chart.data.datasets.map(dataset => dataset.data) };
    });
  });
}

test('Long dialogs keep close controls visible, validate inline, trap focus, and fit all requested sizes', async ({ page, request, account }) => {
  const session = await register(request, account, 'GROCERY'); await restore(page, session);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport); await page.goto('/products');
    await expect(page.getByText('No products found.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add Product', exact: true }).click();
    const dialog = page.getByRole('dialog'), close = dialog.getByRole('button', { name: 'Close dialog' }), save = dialog.getByRole('button', { name: 'Save', exact: true });
    await expect(close).toBeFocused(); await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport(); await expect(close).toBeInViewport();
    if (viewport.width <= 820) { expect((await close.boundingBox()).height).toBeGreaterThanOrEqual(44); expect((await save.boundingBox()).height).toBeGreaterThanOrEqual(44); }
    await save.click(); await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true'); await expect(close).toBeInViewport();
    await page.getByLabel('Name', { exact: true }).fill('Inline validation probe'); await expect(page.getByLabel('Name', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
    await close.focus(); await page.keyboard.press('Shift+Tab'); await expect(save).toBeFocused(); await page.keyboard.press('Tab'); await expect(close).toBeFocused();
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.getByRole('button', { name: 'Add Product', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden'); await fit(page);
  }
});

test('Mobile table cues, textual stock status, touch targets and record-specific guarded deletion use real records', async ({ page, request, account }) => {
  const session = await register(request, account, 'GROCERY');
  const supplier = await create(request, session, '/suppliers', { name: 'Quality audit supplier' });
  const product = await create(request, session, '/products', { name: 'Quality audit product', sku: 'QUALITY', quantity: 0, minimumStock: 3, sellingPrice: 12.35, supplier: supplier._id });
  await restore(page, session); await page.setViewportSize(viewports[0]); await page.goto('/products');
  const table = page.getByRole('table', { name: 'Product inventory', exact: true }), viewport = page.getByRole('region', { name: 'Product inventory table', exact: true });
  await expect(table).toBeVisible(); await expect(page.getByText('Scroll horizontally to view all columns.', { exact: true })).toBeVisible(); await expect(viewport).toHaveAttribute('aria-describedby', /.+/);
  await viewport.focus(); await page.keyboard.press('ArrowRight'); await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  const row = table.getByRole('row').filter({ hasText: product.name }); await expect(row).toContainText('Out of stock');
  const remove = row.getByRole('button', { name: 'Delete', exact: true }); await remove.scrollIntoViewIfNeeded(); expect((await remove.boundingBox()).height).toBeGreaterThanOrEqual(44);
  page.once('dialog', async dialog => { expect(dialog.message()).toContain(product.name); await dialog.dismiss(); }); await remove.click(); await expect(row).toBeVisible();
  let release; const gate = new Promise(resolve => { release = resolve; }); let deletes = 0;
  await page.route('**/api/products/' + product._id, async route => { deletes++; await gate; await route.continue(); });
  page.once('dialog', async dialog => { expect(dialog.message()).toContain(product.name); await dialog.accept(); });
  await remove.evaluate(button => { button.click(); button.click(); }); await expect.poll(() => deletes).toBe(1); await expect(remove).toBeDisabled();
  release(); await expect(page.getByText('No products found.', { exact: true })).toBeVisible(); expect(deletes).toBe(1);
  await expect(page.getByText('Scroll horizontally to view all columns.', { exact: true })).toBeVisible();
  await page.goto('/suppliers'); const supplierRow = page.getByRole('row').filter({ hasText: supplier.name }); await expect(supplierRow).toBeVisible();
  page.once('dialog', async dialog => { expect(dialog.message()).toContain(supplier.name); await dialog.dismiss(); }); await supplierRow.getByRole('button', { name: 'Delete', exact: true }).click(); await expect(supplierRow).toBeVisible();
  await page.route('**/api/suppliers/' + supplier._id, route => route.fulfill({ status: 503, json: { message: 'Temporary test failure' } }));
  page.once('dialog', dialog => dialog.accept()); await supplierRow.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.toast--error')).toBeVisible(); await expect(supplierRow.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
  await expect(supplierRow).toBeVisible(); await fit(page);
});

test('Charts follow reduced-motion changes without changing actual sales data or currency formatting', async ({ page, request, account }) => {
  const session = await register(request, account, 'GROCERY');
  const product = await create(request, session, '/products', { name: 'Motion audit product', sku: 'MOTION', quantity: 10, sellingPrice: 12.35 });
  await create(request, session, '/sales', { product: product._id, quantity: 2 });
  await restore(page, session); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/reports'); await expect(page.locator('canvas')).toHaveCount(3);
  const reduced = await chartStates(page); expect(reduced.every(chart => chart.animation === false)).toBeTruthy(); expect(reduced[0].values[0]).toEqual([24.7, 24.7, 24.7]);
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await expect.poll(async () => (await chartStates(page)).every(chart => chart.animation.duration === 250)).toBeTruthy();
  const normal = await chartStates(page); expect(normal.map(chart => chart.values)).toEqual(reduced.map(chart => chart.values));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect.poll(async () => (await chartStates(page)).every(chart => chart.animation === false)).toBeTruthy();
  await page.goto('/dashboard'); await expect(page.locator('canvas')).toHaveCount(2); expect((await chartStates(page)).every(chart => chart.animation === false)).toBeTruthy();
  const tooltip = await page.evaluate(async () => {
    const source = await (await fetch('/src/components/Chart.jsx')).text(); const { default: C } = await import(source.match(/from ["']([^"']*chart[^"']*auto[^"']*)["']/)[1]);
    const chart = C.getChart(document.querySelector('canvas'));
    return chart.options.plugins.tooltip.callbacks.label({ dataset: chart.data.datasets[0], parsed: { y: 24.7 } });
  });
  expect(tooltip).toBe('Recorded sales: \u20b924.70');
});

test('Auth fields expose autofill and native errors; notifications distinguish errors, pause for focus, dismiss and expire', async ({ page, request, account }) => {
  const session = await register(request, account, 'GROCERY'); await page.clock.install(); await page.goto('/register');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
  await expect(page.getByLabel('Confirm Password')).toHaveAttribute('autocomplete', 'new-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click(); await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Name', { exact: true }).fill(account.name); await page.getByLabel('Email', { exact: true }).fill(account.email); await page.getByLabel('Password', { exact: true }).fill(account.password); await page.getByLabel('Confirm Password').fill('different-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click(); await expect(page.getByRole('alert')).toHaveText('Passwords do not match');
  await expect(page.locator('.toast--error')).toHaveAttribute('aria-atomic', 'true'); const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  await dismiss.focus(); await page.clock.runFor(6000); await expect(dismiss).toBeVisible(); await dismiss.click(); await expect(page.locator('.toast')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeFocused();
  await page.goto('/login'); await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('autocomplete', 'username'); await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
  await restore(page, session); await page.goto('/suppliers'); await expect(page.getByText('No suppliers found.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Supplier', exact: true }).click(); await page.getByLabel('Name', { exact: true }).fill('Notification success probe'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.toast--success')).toContainText('Supplier added'); await page.mouse.move(0, 0); await page.clock.runFor(6000); await expect(page.locator('.toast')).toHaveCount(0);
});
