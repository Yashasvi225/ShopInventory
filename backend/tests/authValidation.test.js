const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { register, login } = require('../controllers/authController');
const { validatedEmail, registrationPassword, loginPassword, EMAIL_MESSAGE, PASSWORD_MESSAGE } = require('../utils/authValidation');

const validEmails = ['user@gmail.com', 'first.last@example.com', 'user+shop@example.co.in', "o'connor@example.com", 'shop@a-b.example.com', '  USER@GMAIL.COM  ', 'owner@example.invalid'];
const invalidEmails = ['', ' ', 'abc', 'test@', '@gmail.com', 'test@gmail', 'test..user@gmail.com', '.test@gmail.com', 'test.@gmail.com',
  'te st@gmail.com', 'test@ gmail.com', 'test@gmail.com\nother', 'test@@gmail.com', 'test@-gmail.com', 'test@gmail-.com',
  'test@g_mail.com', 'test@gmail..com', 'test@gmail.c', 'test@gmail.123', 'test@gmail.com.', 'test@localhost', 'test@[127.0.0.1]',
  'a'.repeat(65) + '@example.com', 'test@' + 'a'.repeat(64) + '.com', 'test@' + ('a'.repeat(63) + '.').repeat(4) + 'com', null, undefined, [], {}, 123];
const weakPasswords = ['password', 'PASSWORD123', 'Password123', 'Pass@1', '', '        ', 'PASSWORD@123', 'password@123', 'Password@abc',
  'Ab1' + ' '.repeat(8), 'Aa1\u00e9aaaa', 'Aa1!\ud83d\ude00ab', null, undefined, [], {}, 123];
const strongPasswords = ['ShopSecure@123', ' Aa1!abcd ', 'Aa1_aaaa', 'Aa1-aaaa', 'Aa1.aaaa', 'Aa1!\u00e9\u00e9\u00e9\u00e9'];

async function call(handler, body) {
  let status = 200, result;
  const response = { status(value) { status = value; return this; }, json(value) { result = value; } };
  await handler({ body }, response, error => { assert.equal(error.statusCode, 400); status = 400; result = { message: error.message }; });
  return { status, body: result };
}

test('Email syntax validates dot-atoms, bounded domain labels and plausible TLDs without claiming ownership', () => {
  for (const email of validEmails) assert.equal(validatedEmail(email), email.trim().toLowerCase());
  for (const email of invalidEmails) assert.throws(() => validatedEmail(email), { statusCode: 400, message: EMAIL_MESSAGE });
});
test('Registration password policy rejects each missing requirement and preserves valid passwords literally', () => {
  for (const password of weakPasswords) assert.throws(() => registrationPassword(password), { statusCode: 400, message: PASSWORD_MESSAGE });
  for (const password of strongPasswords) assert.equal(registrationPassword(password), password);
  for (const password of ['Aa1!' + 'a'.repeat(68), 'Aa1!' + '\u00e9'.repeat(34)]) assert.equal(Buffer.byteLength(registrationPassword(password), 'utf8'), 72);
  for (const password of ['Aa1!' + 'a'.repeat(69), 'Aa1!' + '\u00e9'.repeat(35)]) assert.throws(() => registrationPassword(password), /72 UTF-8 bytes/);
});
test('Frontend and backend email/password policies agree, including unicode byte limits and missing inputs', async () => {
  const front = await import('../../frontend/src/utils/authValidation.js');
  for (const email of [...validEmails, ...invalidEmails]) {
    let message = ''; try { assert.equal(validatedEmail(email), front.normalizeEmail(email)); } catch (error) { message = error.message; }
    assert.equal(front.emailError(email), message);
  }
  for (const password of [...weakPasswords, ...strongPasswords, 'Aa1!' + '\u00e9'.repeat(34), 'Aa1!' + '\u00e9'.repeat(35)]) {
    let message = ''; try { registrationPassword(password); } catch (error) { message = error.message; }
    assert.equal(front.registrationPasswordError(password), message);
  }
  for (const password of ['', null, [], 'old', ' old password ', ' ']) {
    let message = ''; try { loginPassword(password); } catch (error) { message = error.message; }
    assert.equal(front.loginPasswordError(password), message);
  }
});
test('Registration rejects invalid emails and weak passwords before querying or writing users', async context => {
  context.mock.method(User, 'exists', () => assert.fail('Invalid input queried users'));
  context.mock.method(User, 'create', () => assert.fail('Invalid input stored a user'));
  for (const email of invalidEmails) assert.deepEqual(await call(register, { name: 'Auth validation', email, password: 'ShopSecure@123' }), { status: 400, body: { message: EMAIL_MESSAGE } });
  for (const password of weakPasswords) assert.deepEqual(await call(register, { name: 'Auth validation', email: 'user@gmail.com', password }), { status: 400, body: { message: PASSWORD_MESSAGE } });
});
test('Duplicate checks keep the existing trimmed lowercase identity and response', async context => {
  context.mock.method(User, 'exists', async query => { assert.deepEqual(query, { email: 'user@gmail.com' }); return true; });
  context.mock.method(User, 'create', () => assert.fail('Duplicate account stored'));
  assert.deepEqual(await call(register, { name: 'Auth validation', email: ' USER@GMAIL.COM ', password: 'ShopSecure@123' }), { status: 409, body: { message: 'Email already registered' } });
});
test('Login rejects malformed emails and missing passwords before querying users', async context => {
  context.mock.method(User, 'findOne', () => assert.fail('Invalid login queried users'));
  for (const email of invalidEmails) assert.deepEqual(await call(login, { email, password: 'old' }), { status: 400, body: { message: EMAIL_MESSAGE } });
  for (const password of ['', null, undefined, [], {}]) assert.deepEqual(await call(login, { email: 'user@gmail.com', password }), { status: 400, body: { message: 'Password is required' } });
});
test('Existing bcrypt hashes authenticate weak and whitespace-bearing passwords exactly; JWT and safe response stay intact', async context => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'auth-validation-unit-test-only';
  let current;
  const safe = { _id: '000000000000000000000001', name: 'Existing account', email: 'user@gmail.com', shopType: 'GROCERY' };
  context.mock.method(User, 'findOne', query => {
    assert.deepEqual(query, { email: 'user@gmail.com' });
    return { select(field) { assert.equal(field, '+password'); return Promise.resolve(current); } };
  });
  context.mock.method(User, 'findById', async () => safe);
  try {
    for (const password of ['old', 'legacy', ' old password ', ' Aa1!abcd ']) {
      const hash = await bcrypt.hash(password, 12);
      current = { ...safe, password: hash, comparePassword: User.schema.methods.comparePassword };
      const result = await call(login, { email: ' USER@GMAIL.COM ', password });
      assert.equal(result.status, 200); assert.equal(typeof result.body.token, 'string'); assert.deepEqual(result.body.user, safe);
      assert.equal(current.password, hash); assert.equal(Object.hasOwn(result.body.user, 'password'), false);
      if (password.trim() !== password) assert.equal((await call(login, { email: safe.email, password: password.trim() })).status, 401);
    }
    assert.deepEqual(await call(login, { email: safe.email, password: 'incorrect' }), { status: 401, body: { message: 'Invalid email or password' } });
    current = null;
    assert.deepEqual(await call(login, { email: safe.email, password: 'incorrect' }), { status: 401, body: { message: 'Invalid email or password' } });
  } finally { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; }
});
