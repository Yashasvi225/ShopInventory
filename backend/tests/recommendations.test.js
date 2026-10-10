const { test } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../services/geminiService');
const { fallbackRecommendations, recommendationAnalysis, safeGeminiError, validateGeminiSuggestions, getReorderRecommendations } = service;
const items = [{ productId: 'eligible', productName: 'Eligible product', currentStock: 2, minimumStock: 5,
  averageDailySales: 1, expiryDate: null, demandObservation: '30 units in 30 days' }];
const row = { productId: 'eligible', productName: 'Eligible product', suggestedReorderQuantity: 33, urgency: 'HIGH', reason: 'Recorded demand' };

test('Empty analysis identifies no products, expired stock, missing recent sales and adequate stock without fabricating purchases', () => {
  assert.equal(recommendationAnalysis([]).emptyReason, 'NO_PRODUCTS');
  const expired = [{ ...items[0], expiryDate: '2000-01-01' }];
  assert.deepEqual(fallbackRecommendations(expired), []);
  assert.equal(recommendationAnalysis(expired).emptyReason, 'ALL_EXPIRED');
  const noSales = [{ ...items[0], currentStock: 100, averageDailySales: 0 }];
  assert.deepEqual(fallbackRecommendations(noSales), []);
  assert.equal(recommendationAnalysis(noSales).emptyReason, 'NO_RECENT_SALES');
  const stocked = [{ ...items[0], currentStock: 100 }];
  assert.deepEqual(fallbackRecommendations(stocked), []);
  assert.equal(recommendationAnalysis(stocked).emptyReason, 'NO_REORDER_NEEDED');
  assert.equal(recommendationAnalysis(items).emptyReason, 'NO_MODEL_SUGGESTIONS');
});

test('Existing fallback formula and manual no-sales minimum-stock guidance remain unchanged', () => {
  const fallback = fallbackRecommendations(items);
  assert.equal(fallback[0].suggestedReorderQuantity, 33);
  assert.equal(recommendationAnalysis(items, fallback).emptyReason, null);
  assert.equal(fallbackRecommendations([{ ...items[0], averageDailySales: 0 }])[0].suggestedReorderQuantity, 8);
});

test('Gemini cannot recommend ineligible, expired, duplicate, foreign or over-target products', () => {
  assert.equal(validateGeminiSuggestions([row], items)[0].suggestedReorderQuantity, 33);
  for (const [raw, input] of [
    [[row], [{ ...items[0], currentStock: 100 }]],
    [[row], [{ ...items[0], expiryDate: '2000-01-01' }]],
    [[row, row], items], [[{ ...row, productId: 'foreign' }], items],
    [[{ ...row, suggestedReorderQuantity: 34 }], items],
  ]) assert.throws(() => validateGeminiSuggestions(raw, input));
});

test('Provider diagnostics are classified without exposing private messages', () => {
  for (const [error, code] of [
    [{ code: 'NOT_CONFIGURED' }, 'NOT_CONFIGURED'], [{ status: 401 }, 'CONFIGURATION_OR_ACCESS'],
    [{ status: 403 }, 'CONFIGURATION_OR_ACCESS'], [{ status: 400 }, 'INVALID_REQUEST'],
    [{ status: 404 }, 'MODEL_UNAVAILABLE'], [{ status: 503 }, 'PROVIDER_UNAVAILABLE'],
    [{ code: 'TIMEOUT' }, 'TIMEOUT'], [{ cause: { code: 'ENOTFOUND' } }, 'NETWORK_ERROR'],
    [{ code: 'INVALID_RESPONSE' }, 'INVALID_RESPONSE'], [{}, 'PROVIDER_ERROR'],
  ]) {
    const diagnostic = safeGeminiError({ ...error, message: 'sensitive-key-and-inventory', request: 'private' });
    assert.equal(diagnostic.code, code);
    assert.doesNotMatch(JSON.stringify(diagnostic), /sensitive|private/);
  }
});

test('Mocked Gemini success, valid empty output, provider errors and invalid output preserve truthful source and real fallback', async context => {
  const { GoogleGenAI } = await import('@google/genai');
  const probe = new GoogleGenAI({ apiKey: 'verification-only' });
  let response = JSON.stringify([row]), failure, calls = 0;
  context.mock.method(Object.getPrototypeOf(probe.models), 'generateContentInternal', async () => {
    calls++; if (failure) throw Object.assign(new Error('sensitive verification failure'), failure);
    return { text: response };
  });
  const original = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'verification-only';
  try {
    assert.equal((await getReorderRecommendations(items, 'RESTAURANT')).source, 'GEMINI');
    response = '[]';
    assert.deepEqual(await getReorderRecommendations(items, 'RESTAURANT'), { source: 'GEMINI', suggestions: [] });
    for (const text of ['{malformed', JSON.stringify([{ ...row, productId: 'foreign' }]), JSON.stringify([row, row])]) {
      response = text;
      const result = await getReorderRecommendations(items, 'RESTAURANT');
      assert.equal(result.providerError.code, 'INVALID_RESPONSE');
      assert.equal(result.source, 'RULE_BASED');
      assert.deepEqual(result.suggestions, fallbackRecommendations(items));
    }
    for (const [error, code] of [[{ status: 403 }, 'CONFIGURATION_OR_ACCESS'], [{ status: 404 }, 'MODEL_UNAVAILABLE'],
      [{ status: 503 }, 'PROVIDER_UNAVAILABLE'], [{ code: 'TIMEOUT' }, 'TIMEOUT'], [{ cause: { code: 'ECONNRESET' } }, 'NETWORK_ERROR']]) {
      failure = error;
      const result = await getReorderRecommendations(items, 'RESTAURANT');
      assert.equal(result.providerError.code, code);
      assert.equal(result.source, 'RULE_BASED');
      assert.deepEqual(result.suggestions, fallbackRecommendations(items));
      assert.doesNotMatch(JSON.stringify(result), /sensitive verification/);
    }
    delete process.env.GEMINI_API_KEY;
    const before = calls, result = await getReorderRecommendations(items, 'RESTAURANT');
    assert.equal(result.providerError.code, 'NOT_CONFIGURED');
    assert.equal(calls, before);
  } finally { if (original === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = original; }
});

test('Controller uses only authorized active-store products and dated, linked sales; an empty store never calls Gemini', async context => {
  const Product = require('../models/Product'), Sale = require('../models/Sale');
  let products = [], capturedProducts, capturedSales, capturedItems, called = 0, result;
  context.mock.method(Product, 'find', filter => { capturedProducts = filter; return { lean: async () => products }; });
  context.mock.method(Sale, 'find', filter => { capturedSales = filter; return { select: () => ({ lean: async () => [{ product: 'eligible', quantity: 30, date: new Date() }] }) }; });
  context.mock.method(service, 'getReorderRecommendations', async input => { called++; capturedItems = input; return { source: 'RULE_BASED', suggestions: fallbackRecommendations(input) }; });
  delete require.cache[require.resolve('../controllers/aiController')];
  const { reorderSuggestions } = require('../controllers/aiController');
  const req = { user: { _id: 'owner' }, store: { _id: 'restaurant', createdBy: 'owner', shopType: 'RESTAURANT' } };
  const res = { json: body => { result = body; } };
  await reorderSuggestions(req, res, assert.fail);
  assert.equal(result.source, 'NO_DATA'); assert.equal(result.analysis.emptyReason, 'NO_PRODUCTS'); assert.equal(called, 0);
  products = [{ _id: 'eligible', name: 'Eligible product', shopType: 'RESTAURANT', quantity: 2, minimumStock: 5, expiryDate: null }];
  await reorderSuggestions(req, res, assert.fail);
  assert.deepEqual(capturedProducts, { createdBy: 'owner', store: 'restaurant' });
  assert.equal(capturedSales.createdBy, 'owner'); assert.equal(capturedSales.store, 'restaurant');
  assert.deepEqual(capturedSales.product.$in, ['eligible']);
  assert.ok(capturedSales.date.$gte instanceof Date && capturedSales.date.$lte instanceof Date);
  assert.equal(capturedItems[0].averageDailySales, 1); assert.equal(result.suggestions[0].suggestedReorderQuantity, 33);
});

test('Quota errors are surfaced, never immediately retried, and cooldown retains calculated fallback', async context => {
  const { GoogleGenAI } = await import('@google/genai');
  const probe = new GoogleGenAI({ apiKey: 'verification-only' }); let calls = 0;
  context.mock.method(Object.getPrototypeOf(probe.models), 'generateContentInternal', async () => {
    calls++; throw Object.assign(new Error('429 with 503 UNAVAILABLE details'), { status: 429 });
  });
  const original = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'verification-only';
  try {
    const first = await getReorderRecommendations(items, 'RESTAURANT');
    assert.equal(first.providerError.code, 'RATE_LIMITED'); assert.equal(first.providerError.httpStatus, 429);
    assert.ok(Date.parse(first.providerError.retryAt) > Date.now());
    const second = await getReorderRecommendations(items, 'RESTAURANT');
    assert.equal(calls, 1); assert.equal(second.source, 'RULE_BASED');
    assert.deepEqual(second.suggestions, fallbackRecommendations(items));
  } finally { if (original === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = original; }
});
