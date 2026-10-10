const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nonNegative, positive, requiredString, validDate, literalSearch, resultLimit, isValidObjectId } = require('../utils/validators');
const { errorHandler } = require('../middleware/errorMiddleware');
const { validateGeminiSuggestions, fallbackRecommendations, parseGeminiResponseText, getReorderRecommendations } = require('../services/geminiService');

test('Numeric validation preserves supported numbers and numeric strings without coercing malformed JSON', () => {
  for (const value of [true, false, null, undefined, [], [1], {}, '', ' ', 'NaN', Infinity, -1, 1e20]) {
    assert.throws(() => nonNegative(value, 'quantity'), { statusCode: 400 });
  }
  for (const value of [0, 1.5, '2.5']) assert.equal(nonNegative(value, 'quantity'), Number(value));
  assert.equal(positive('1.5', 'quantity'), 1.5);
  assert.throws(() => positive(0.5, 'quantity'));
});
test('Required text, ObjectIds, query limits and searches reject malformed inputs', () => {
  assert.throws(() => requiredString({}, 'name')); assert.throws(() => requiredString(true, 'name'));
  assert.equal(requiredString(' name ', 'name'), 'name');
  assert.equal(isValidObjectId(12), false); assert.equal(isValidObjectId({}), false);
  assert.equal(literalSearch('['), '\\['); assert.equal(literalSearch('.*'), '\\.\\*');
  assert.equal(resultLimit('200', 100), 200);
  for (const limit of ['-1', '0', '1000000', '1.5', ['1']]) assert.throws(() => resultLimit(limit, 200));
});
test('Dates reject impossible calendar days without changing optional expiry semantics', () => {
  for (const value of ['2026-02-30', '2026-13-01', 'invalid', true, [], {}]) assert.throws(() => validDate(value, 'date'));
  assert.equal(validDate('2028-02-29', 'date').toISOString(), '2028-02-29T00:00:00.000Z');
  assert.equal(validDate(null, 'expiryDate', true), null);
});
test('Unexpected errors do not expose secrets, database diagnostics or stack traces even in development', () => {
  let status, body;
  errorHandler(Object.assign(new Error('private database URI and GEMINI_SECRET'), { stack: 'private stack' }),
    { method: 'GET' }, { status(value) { status = value; return this; }, json(value) { body = value; } });
  assert.equal(status, 500); assert.equal(Object.hasOwn(body, 'stack'), false);
  assert.doesNotMatch(body.message, /private|SECRET|database/);
});
test('Malformed JSON errors expose neither request content nor parser details', () => {
  let body;
  errorHandler({ type: 'entity.parse.failed', statusCode: 400, message: 'sensitive parser contents' }, {},
    { status() { return this; }, json(value) { body = value; } });
  assert.equal(body.message, 'Request body must be valid JSON');
});
const items = ['one', 'two'].map(productId => ({ productId, productName: 'Same product name', currentStock: 0,
  minimumStock: 1, averageDailySales: 1, expiryDate: null, demandObservation: '30 recorded units' }));
const row = productId => ({ productId, productName: 'Same product name', suggestedReorderQuantity: 31,
  urgency: 'HIGH', reason: 'Recorded demand', demandObservation: 'Invented demand' });
test('Manual Gemini recommendations distinguish products with identical names by identity', () => {
  const valid = validateGeminiSuggestions([row('one'), row('two')], items);
  assert.deepEqual(valid.map(value => value.productId), ['one', 'two']);
  assert.equal(valid[0].demandObservation, '30 recorded units');
});
test('Manual Gemini recommendations reject invalid, foreign, duplicate and unbounded quantities', () => {
  for (const raw of [[row('foreign')], [row('one'), row('one')], [{ ...row('one'), suggestedReorderQuantity: 1e15 }],
    [{ ...row('one'), suggestedReorderQuantity: '31' }], [{ ...row('one'), suggestedReorderQuantity: -1 }]]) {
    assert.throws(() => validateGeminiSuggestions(raw, items));
  }
  assert.deepEqual(fallbackRecommendations([{ ...items[0], minimumStock: Number.MAX_SAFE_INTEGER }]), []);
});

test('Manual Gemini text rejects missing, malformed and non-array responses while preserving valid empty results', () => {
  for (const text of [undefined, null, '', ' ', 42, {}, [], '{malformed', '{}', 'null', JSON.stringify([row('foreign')])]) {
    assert.throws(() => parseGeminiResponseText(text, items), { code: 'INVALID_RESPONSE' });
  }
  assert.deepEqual(parseGeminiResponseText('[]', items), []);
  assert.equal(parseGeminiResponseText(JSON.stringify([row('one')]), items)[0].productId, 'one');
});

test('Registration rejects passwords beyond the bcrypt byte limit before querying or writing the database', async context => {
  const User = require('../models/User');
  const { register } = require('../controllers/authController');
  context.mock.method(User, 'exists', () => assert.fail('Invalid passwords must be rejected before database queries'));
  context.mock.method(User, 'create', () => assert.fail('Invalid passwords must not be stored'));
  for (const password of ['a'.repeat(73), '\u00e9'.repeat(37)]) {
    let status, body;
    await register({ body: { name: 'Boundary verification', email: 'boundary@example.invalid', password } },
      { status(value) { status = value; return this; }, json(value) { body = value; } }, error => { status = error.statusCode; body = { message: error.message }; });
    assert.equal(status, 400);
    assert.match(body.message, /72 UTF-8 bytes/);
  }
});

test('Registration preserves passwords exactly at the bcrypt UTF-8 byte boundary', async context => {
  const User = require('../models/User');
  const { register } = require('../controllers/authController');
  const originalSecret = process.env.JWT_SECRET;
  const stored = [];
  context.mock.method(User, 'exists', async () => false);
  context.mock.method(require('mongoose').connection, 'transaction', async work => work({}));
  context.mock.method(User, 'create', async ([fields]) => { stored.push(fields.password); return [{ _id: '000000000000000000000001', name: fields.name, email: fields.email }]; });
  process.env.JWT_SECRET = 'local-boundary-verification-only';
  try {
    for (const password of ['Aa1!' + 'a'.repeat(68), 'Aa1!' + '\u00e9'.repeat(34)]) {
      let status, body;
      await register({ body: { name: 'Boundary verification', email: 'boundary@example.invalid', password } },
        { status(value) { status = value; return this; }, json(value) { body = value; } }, error => assert.fail(error));
      assert.equal(status, 201);
      assert.equal(typeof body.token, 'string');
      assert.equal(stored.at(-1), password);
      assert.equal(Buffer.byteLength(password, 'utf8'), 72);
    }
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
  }
});

test('Invalid manual provider response text returns application fallback instead of fabricated Gemini success', async context => {
  const { GoogleGenAI } = await import('@google/genai');
  const probe = new GoogleGenAI({ apiKey: 'local-provider-verification-only' });
  let responseText;
  context.mock.method(Object.getPrototypeOf(probe.models), 'generateContentInternal', async () => ({ text: responseText }));
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'local-provider-verification-only';
  try {
    for (const text of [undefined, '', {}, '{malformed', '{}']) {
      responseText = text;
      const result = await getReorderRecommendations(items, 'GROCERY');
      assert.equal(result.source, 'RULE_BASED');
      assert.deepEqual(result.suggestions, fallbackRecommendations(items));
    }
    responseText = '[]';
    assert.deepEqual(await getReorderRecommendations(items, 'GROCERY'), { source: 'GEMINI', suggestions: [] });
    responseText = JSON.stringify([row('one')]);
    const valid = await getReorderRecommendations(items, 'GROCERY');
    assert.equal(valid.source, 'GEMINI');
    assert.equal(valid.suggestions[0].productId, 'one');
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});

test('HTTP 429 is never retried despite temporary-error detail text and subsequent requests respect cooldown', async context => {
  const { GoogleGenAI } = await import('@google/genai');
  const probe = new GoogleGenAI({ apiKey: 'local-provider-verification-only' });
  let calls = 0;
  context.mock.method(Object.getPrototypeOf(probe.models), 'generateContentInternal', async () => {
    calls += 1;
    const error = new Error('HTTP 429 with 503 UNAVAILABLE in provider detail'); error.status = 429; throw error;
  });
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'local-provider-verification-only';
  try {
    const first = await getReorderRecommendations(items, 'GROCERY');
    assert.equal(first.source, 'RULE_BASED');
    assert.deepEqual(first.suggestions, fallbackRecommendations(items));
    assert.equal(calls, 1);
    const second = await getReorderRecommendations(items, 'GROCERY');
    assert.equal(second.source, 'RULE_BASED');
    assert.equal(calls, 1);
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});
