const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expiryEvent, salesBasis } = require('../domain/expiryAlerts');
const { validateExpiryRecommendation, boundedGeminiCall, generateExpiryRecommendation } = require('../services/geminiService');

const now = new Date('2026-10-09T23:59:59.999Z');
const product = { _id: 'product-a', createdBy: 'retailer-a', shopType: 'GROCERY',
  quantity: 12, createdAt: '2026-09-01T00:00:00Z', expiryDate: '2026-10-11' };

for (const [expiry, expected] of [['2026-10-09', 0], ['2026-10-10', 1], ['2026-10-11', 2],
  ['2026-10-12', null], ['2026-10-08', null], [null, null], ['', null], ['not-a-date', null]]) {
  test(`UTC expiry eligibility for ${expiry}`, () => {
    const event = expiryEvent({ ...product, expiryDate: expiry }, now);
    assert.equal(event?.daysRemaining ?? null, expected);
  });
}
for (const shopType of ['MEDICAL', 'RESTAURANT', 'GROCERY']) {
  test(`${shopType} is eligible throughout the expiry calendar day`, () => {
    assert.equal(expiryEvent({ ...product, shopType, expiryDate: '2026-10-09T00:00:00Z' }, now).daysRemaining, 0);
  });
}
test('Clothing is excluded before reading or calculating any expiry date', async () => {
  const clothing = { shopType: 'CLOTHING', get expiryDate() { throw new Error('Must not read Clothing expiry'); } };
  assert.equal(expiryEvent(clothing, now), null);
  await assert.rejects(generateExpiryRecommendation({ shopType: 'CLOTHING' }), /Ineligible/);
});
test('UTC boundaries do not change with local offsets, time of day or leap days', () => {
  assert.equal(expiryEvent({ ...product, expiryDate: '2026-10-11' }, new Date('2026-10-10T01:00:00+05:30')).daysRemaining, 2);
  assert.equal(expiryEvent({ ...product, expiryDate: '2028-03-01' }, new Date('2028-02-28T12:00:00Z')).daysRemaining, 2);
  assert.equal(expiryEvent({ ...product, expiryDate: '2026-10-09' }, new Date('2026-10-10T00:00:00Z')), null);
});

const sale = (quantity, date, fields = {}) => ({ product: product._id, createdBy: product.createdBy, quantity, date, ...fields });
test('Sufficient sales history produces the stated seven-day replacement estimate', () => {
  const basis = salesBasis(product, [sale(30, '2026-10-01'), sale(30, '2026-10-04'), sale(30, '2026-10-08')], now);
  assert.equal(basis.unitsSold, 90); assert.equal(basis.observationDays, 30);
  assert.equal(basis.averageDailySales, 3); assert.equal(basis.suggestedPurchaseQuantity, 21);
  assert.equal(basis.confidence, 'MODERATE'); assert.equal(basis.currentStockAtAnalysis, 12);
  assert.equal(basis.estimatedUnsoldAtExpiry, 3);
});
test('Limited history explicitly limits confidence; new products use their actual observation days', () => {
  const basis = salesBasis({ ...product, createdAt: '2026-10-08' }, [sale(2, '2026-10-08')], now);
  assert.equal(basis.observationDays, 2); assert.equal(basis.suggestedPurchaseQuantity, 7);
  assert.equal(basis.confidence, 'LIMITED'); assert.match(basis.limitation, /Limited history/);
});
test('No sales produces no invented purchase quantity and does not rely on minimum stock', () => {
  const basis = salesBasis({ ...product, minimumStock: 100 }, [], now);
  assert.equal(basis.suggestedPurchaseQuantity, null); assert.equal(basis.confidence, 'NO_DATA');
});
test('Foreign retailers/products, future/old dates and invalid quantities cannot enter the basis', () => {
  const sales = [sale(3, '2026-10-08'), sale(1000, '2026-10-08', { createdBy: 'retailer-b' }),
    sale(1000, '2026-10-08', { product: 'product-b' }), sale(1000, '2026-10-10'),
    sale(1000, '2026-09-01'), sale(-3, '2026-10-08'), sale(NaN, '2026-10-08'), sale(2, 'invalid')];
  const basis = salesBasis(product, sales, now);
  assert.equal(basis.unitsSold, 3); assert.equal(basis.saleCount, 1);
});
test('Backdated real sale dates extend a new product observation period; zero/high stock is reported honestly', () => {
  const sales = [sale(30, '2026-09-20')];
  const basis = salesBasis({ ...product, createdAt: now, quantity: 0 }, sales, now);
  assert.equal(basis.observationDays, 20); assert.equal(basis.currentStockAtAnalysis, 0);
  assert.equal(basis.suggestedPurchaseQuantity, 11);
  const highStock = salesBasis({ ...product, quantity: 1000 }, sales, now);
  assert.equal(highStock.suggestedPurchaseQuantity, 7); // different 30-day observation window
  assert.ok(highStock.estimatedUnsoldAtExpiry > 900);
});
test('Unrepresentable purchase quantities never become advice', () => {
  const basis = salesBasis(product, [sale(Number.MAX_VALUE, '2026-10-08')], now);
  assert.equal(basis.suggestedPurchaseQuantity, null);
});

const item = { productId: 'product-a', salesBasis: { suggestedPurchaseQuantity: 21, confidence: 'MODERATE' } };
const response = { productId: 'product-a', suggestedPurchaseQuantity: 21, reason: 'RECORDED_DEMAND', caution: 'CHECK_SHELF_LIFE' };
test('Structured Gemini explanation preserves the exact deterministic quantity', () => {
  const result = validateExpiryRecommendation(response, item);
  assert.equal(result.source, 'GEMINI'); assert.equal(result.suggestedPurchaseQuantity, 21);
  assert.match(result.explanation, /recorded sales/);
});
test('Invalid/negative/nonsensical/foreign or unsupported Gemini responses are rejected', () => {
  for (const raw of [null, [], { ...response, productId: 'foreign' }, { ...response, suggestedPurchaseQuantity: -1 },
    { ...response, suggestedPurchaseQuantity: '21' }, { ...response, suggestedPurchaseQuantity: 21.5 },
    { ...response, suggestedPurchaseQuantity: 1e20 }, { ...response, suggestedPurchaseQuantity: 22 },
    { ...response, reason: 'Invented seasonal trend' }, { ...response, caution: 'LIMITED_HISTORY' }]) {
    assert.throws(() => validateExpiryRecommendation(raw, item), /Invalid expiry recommendation/);
  }
});
test('Limited evidence cannot be presented by Gemini without its required caution', () => {
  const limited = { ...item, salesBasis: { ...item.salesBasis, confidence: 'LIMITED' } };
  assert.throws(() => validateExpiryRecommendation(response, limited));
  assert.match(validateExpiryRecommendation({ ...response, caution: 'LIMITED_HISTORY' }, limited).explanation, /limited/);
});
test('Provider errors propagate and a hung provider is bounded and aborted', async () => {
  await assert.rejects(boundedGeminiCall(async () => { throw new Error('Provider unavailable'); }), /unavailable/);
  let signal;
  await assert.rejects(boundedGeminiCall(abortSignal => { signal = abortSignal; return new Promise(() => {}); }, 10), error => error.code === 'TIMEOUT');
  assert.equal(signal.aborted, true);
});

test('Database failures propagate to the API error handler rather than hiding warnings behind an empty success', async context => {
  const Product = require('../models/Product');
  const { getExpiryAlerts } = require('../controllers/expiryAlertController');
  const failure = new Error('Database temporarily unavailable');
  context.mock.method(Product, 'find', () => { throw failure; });
  let forwarded;
  await getExpiryAlerts({ user: { _id: 'owner', shopType: 'GROCERY' }, store: { _id:'store', createdBy:'owner', shopType:'GROCERY' } },
    { json() { assert.fail('Database errors must not become successful empty alerts'); } }, error => { forwarded = error; });
  assert.equal(forwarded, failure);
});

test('Missing Gemini credentials fail safely on the server without inventing a result', async () => {
  const key = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(generateExpiryRecommendation({ ...item, shopType: 'GROCERY' }), error => error.code === 'NOT_CONFIGURED');
  } finally {
    if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key;
  }
});
