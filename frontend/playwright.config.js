import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5500',
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'chrome' : undefined),
    headless: true,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'npm --prefix ../backend start', url: 'http://localhost:5000/api/health', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run dev', url: 'http://localhost:5500', reuseExistingServer: true, timeout: 60_000 },
  ],
});
