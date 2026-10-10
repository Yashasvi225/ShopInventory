const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SHOP_TYPES } = require('../domain/storeTypes');
const { registrationPassword, validatedEmail } = require('../utils/authValidation');
const { identity, PRESENTATION_NAMESPACE } = require('../demo/data');
const { seedDemo } = require('../demo/seed');
const { generatePasswords, validatePasswords, protectPasswords, unprotectPasswords, newVault, readVault, writeVault } = require('../demo/presentationCredentials');

test('Presentation identity is separate from the existing local demo and uses placeholder account emails', () => {
  for (const type of SHOP_TYPES) {
    const account = identity(type, PRESENTATION_NAMESPACE);
    assert.equal(account.email, `demo.${type.toLowerCase()}@example.com`);
    assert.equal(validatedEmail(account.email), account.email);
    assert.notEqual(account.email, identity(type).email);
  }
});
test('Every generated presentation password is strong, bounded and distinct per store and invocation', () => {
  const all = new Set();
  for (let index = 0; index < 20; index++) {
    const passwords = generatePasswords();
    for (const type of SHOP_TYPES) { const value = passwords[type]; registrationPassword(value); assert.ok(!all.has(value)); all.add(value); }
  }
  const passwords = generatePasswords(); passwords.CLOTHING = passwords.MEDICAL;
  assert.throws(() => validatePasswords(passwords), /unique password/);
  assert.throws(() => validatePasswords({ MEDICAL: 'password' }), /Four distinct/);
});
test('Windows DPAPI vault round-trips credentials without storing plaintext and preserves a pending reset', { skip: process.platform !== 'win32' }, () => {
  const root = path.join(__dirname, '../test-results'); fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, `presentation-${randomUUID()}.json`);
  try {
    const passwords = generatePasswords(), next = generatePasswords();
    const current = protectPasswords(passwords), pending = protectPasswords(next);
    writeVault(newVault(current, pending), file, true);
    const contents = fs.readFileSync(file, 'utf8');
    assert.throws(() => writeVault(newVault(pending), file, true), { code: 'EEXIST' });
    assert.equal(fs.readFileSync(file, 'utf8'), contents);
    for (const value of [...Object.values(passwords), ...Object.values(next)]) assert.equal(contents.includes(value), false);
    const restored = readVault(file);
    assert.deepEqual(unprotectPasswords(restored.current), passwords);
    assert.deepEqual(unprotectPasswords(restored.pending), next);
    restored.current = restored.pending; restored.pending = null; writeVault(restored, file);
    assert.deepEqual(unprotectPasswords(readVault(file).current), next);
  } finally { if (fs.existsSync(file)) fs.unlinkSync(file); }
});
test('Unknown credential files are never overwritten by presentation setup', { skip: process.platform !== 'win32' }, () => {
  const root = path.join(__dirname, '../test-results'); fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, `presentation-${randomUUID()}.json`);
  try {
    fs.writeFileSync(file, '{"unrelated":"preserve"}');
    assert.throws(() => writeVault(newVault(protectPasswords(generatePasswords())), file), /refusing overwrite/);
    assert.equal(fs.readFileSync(file, 'utf8'), '{"unrelated":"preserve"}');
  } finally { if (fs.existsSync(file)) fs.unlinkSync(file); }
});
test('Presentation seed rejects shared or missing credentials before accessing the database', async () => {
  await assert.rejects(seedDemo({ namespace: PRESENTATION_NAMESPACE, password: 'ShopSecure@123' }), /unique password/);
  await assert.rejects(seedDemo({ namespace: PRESENTATION_NAMESPACE, passwords: { MEDICAL: 'ShopSecure@123' } }), /missing/);
});
