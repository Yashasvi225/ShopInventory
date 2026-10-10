import { test, expect, register } from './fixtures.js';
import { providerMessage, emptyRecommendationMessage, summarizeRecommendations } from '../src/utils/recommendationMessages.js';
import { validApiData } from '../src/apiContract.js';
const endpoint = '/ai/reorder-suggestions';

test('Recommendation counters, empty explanations and diagnostic contract use actual returned values', () => {
  expect(summarizeRecommendations([])).toEqual({ returned: 0, actionable: 0, units: 0 });
  expect(summarizeRecommendations([{ suggestedReorderQuantity: 0 }, { suggestedReorderQuantity: 7 }, { suggestedReorderQuantity: 3 }])).toEqual({ returned: 3, actionable: 2, units: 10 });
  for (const code of ['NO_PRODUCTS', 'ALL_EXPIRED', 'NO_RECENT_SALES', 'NO_REORDER_NEEDED', 'NO_MODEL_SUGGESTIONS']) {
    expect(emptyRecommendationMessage({ analysis: { emptyReason: code } }).length).toBeGreaterThan(30);
  }
  const result = { source: 'RULE_BASED', suggestions: [], providerError: { code: 'PROVIDER_UNAVAILABLE', httpStatus: 503 },
    analysis: { totalProducts: 2, expiredProducts: 0, eligibleProducts: 0, productsWithoutRecentSales: 0, emptyReason: 'NO_REORDER_NEEDED' } };
  expect(validApiData(endpoint, result)).toBeTruthy();
  expect(providerMessage(result)).toContain('503');
  expect(validApiData(endpoint, { ...result, providerError: { code: 'unknown-private-message' } })).toBeFalsy();
  expect(validApiData(endpoint, { ...result, analysis: { ...result.analysis, totalProducts: -1 } })).toBeFalsy();
  expect(validApiData(endpoint, { source: 'RULE_BASED', suggestions: [] })).toBeTruthy();
});

test('Actual empty Restaurant store and high stock explain zero suggestions without borrowing other accounts data', async ({ page, request, account }) => {
  const session = await register(request, account, 'RESTAURANT');
  await page.addInitScript(value => { localStorage.setItem('token', value.token); localStorage.setItem('user', JSON.stringify(value.user)); }, session);
  const errors = []; page.on('pageerror', error => errors.push(error.name));
  await page.goto('/ai-recommendations');
  await page.getByRole('button', { name: 'Generate AI Recommendations', exact: true }).click();
  await expect(page.locator('.recommendation-panel')).toContainText('No products are available in the active store.');
  await expect(page.locator('.ai-status-label')).toHaveText('No inventory data');
  expect(await page.locator('.recommendation-grid article').count()).toBe(0);
  const product = await request.post('http://localhost:5000/api/products', { headers: session.headers,
    data: { name: 'High stock verification', sku: 'AI-HIGH', sellingPrice: 10, quantity: 100, minimumStock: 5 } });
  expect(product.status()).toBe(201);
  await page.getByRole('button', { name: 'Generate AI Recommendations', exact: true }).click();
  await expect(page.locator('.ai-status-label')).toHaveText('Rule-based fallback');
  await expect(page.locator('.fallback-note')).toContainText('Gemini is not configured');
  await expect(page.locator('.recommendation-panel')).toContainText('No recent sales were recorded');
  await expect(page.locator('.recommendation-panel')).toContainText('Analyzed 1 products');
  expect(await page.locator('.recommendation-grid article').count()).toBe(0);
  await expect(page.locator('.page-summary .stat strong')).toHaveText(['0', '0', '0']);
  expect(errors).toEqual([]);
});

test('Mocked provider statuses, success, fallback and empty output have accurate visible counters and no secret diagnostics', async ({ page, request, account }) => {
  const session = await register(request, account, 'CLOTHING');
  await page.addInitScript(value => { localStorage.setItem('token', value.token); localStorage.setItem('user', JSON.stringify(value.user)); }, session);
  const row = { productId: 'verification-product', productName: 'Verified response product', suggestedReorderQuantity: 7, currentStock: 2, averageDailySales: 1, reason: 'Recorded demand', urgency: 'HIGH' };
  let response = { source: 'GEMINI', suggestions: [row] };
  await page.route('**/api/ai/reorder-suggestions', route => route.fulfill({ json: response }));
  await page.goto('/ai-recommendations');
  const generate = page.getByRole('button', { name: 'Generate AI Recommendations', exact: true });
  await generate.click();
  await expect(page.locator('.ai-status-label')).toHaveText('Gemini');
  await expect(page.locator('.page-summary .stat strong')).toHaveText(['1', '1', '7']);
  for (const [code, status, message] of [['RATE_LIMITED', 429, 'quota or rate limits'], ['CONFIGURATION_OR_ACCESS', 403, 'credentials or access'],
    ['TIMEOUT', undefined, 'timed out'], ['NETWORK_ERROR', undefined, 'could not connect'], ['PROVIDER_UNAVAILABLE', 503, 'temporarily unavailable'],
    ['INVALID_RESPONSE', undefined, 'invalid recommendation'], ['NOT_CONFIGURED', undefined, 'not configured']]) {
    response = { source: 'RULE_BASED', suggestions: [row], providerError: { code, ...(status ? { httpStatus: status } : {}) } };
    await generate.click();
    await expect(page.locator('.fallback-note')).toContainText(message);
    await expect(page.locator('.ai-status-label')).toHaveText('Rule-based fallback');
    await expect(page.getByRole('article', { name: 'Recommendation for ' + row.productName, exact: true })).toBeVisible();
    await expect(page.locator('.page-summary .stat strong')).toHaveText(['1', '1', '7']);
    if (status) await expect(page.locator('.fallback-note')).toContainText(String(status));
  }
  response = { source: 'RULE_BASED', suggestions: [], providerError: { code: 'PROVIDER_UNAVAILABLE', httpStatus: 503 },
    analysis: { totalProducts: 1, expiredProducts: 0, eligibleProducts: 0, productsWithoutRecentSales: 0, emptyReason: 'NO_REORDER_NEEDED' } };
  await generate.click();
  await expect(page.locator('.recommendation-panel')).toContainText('No products meet the existing reorder rules');
  await expect(page.locator('.page-summary .stat strong')).toHaveText(['0', '0', '0']);
  await expect(page.locator('.recommendation-grid article')).toHaveCount(0);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});
