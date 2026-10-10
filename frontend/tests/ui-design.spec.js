import { test, expect, register } from './fixtures.js';

test('Responsive shell keeps the active mobile link focused and contains keyboard navigation', async ({ page, request, account }) => {
  const session = await register(request, account, 'GROCERY');
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, { token: session.token, user: session.user });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/products');
    await expect(page.getByText('No products found.', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const active = page.getByRole('navigation').getByRole('link', { name: 'Products', exact: true });
    if (width <= 820) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(active).toBeFocused();
      await expect(active).toHaveAttribute('aria-current', 'page');
      const sidebar = await page.locator('#sidebar').boundingBox();
      expect(sidebar.x).toBeGreaterThanOrEqual(0);
      expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(width);
      const logout = page.getByRole('link', { name: 'Logout', exact: true });
      await logout.focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Close navigation' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(logout).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
      expect(await page.locator('#sidebar').evaluate(element => element.inert)).toBe(true);
    } else {
      await expect(active).toBeVisible();
      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: 'Skip to main content' });
      await expect(skip).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#main-content')).toBeFocused();
    }
  }
});

test('Public pages and registration errors fit narrow screens without clipping the form', async ({ page, account }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/login', '/register']) {
      await page.goto(route);
      if (route === '/register') {
        await page.getByLabel('Name', { exact: true }).fill(account.name);
        await page.getByLabel('Email', { exact: true }).fill(account.email);
        await page.getByLabel('Password', { exact: true }).fill(account.password);
        await page.getByLabel('Confirm Password').fill('mismatch');
        await page.getByRole('button', { name: 'Register', exact: true }).click();
        await expect(page.getByRole('alert')).toHaveText('Passwords do not match');
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    }
  }
});
