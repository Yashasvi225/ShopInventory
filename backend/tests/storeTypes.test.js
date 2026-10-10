const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
const Supplier = require('../models/Supplier');
const { validShopType } = require('../utils/validators');

const owner = new mongoose.Types.ObjectId();
const base = { name: 'Schema verification', sku: 'SCHEMA-VERIFY', sellingPrice: 20, createdBy: owner };

for (const shopType of ['MEDICAL', 'RESTAURANT', 'GROCERY']) {
  test(`${shopType} keeps expiry optional and persists valid expiry`, async () => {
    const withoutDate = new Product({ ...base, shopType });
    await withoutDate.validate();
    assert.equal(withoutDate.expiryDate, null);
    const withDate = new Product({ ...base, shopType, expiryDate: '2030-01-01' });
    await withDate.validate();
    assert.equal(withDate.expiryDate.toISOString(), '2030-01-01T00:00:00.000Z');
  });
  test(`${shopType} rejects malformed expiry and clothing-only fashion`, async () => {
    await assert.rejects(new Product({ ...base, shopType, expiryDate: 'not-a-date' }).validate(), /expiryDate/);
    await assert.rejects(new Product({ ...base, shopType, fashionType: 'OLD_FASHION' }).validate(), /only available for Clothing/);
  });
}
for (const fashionType of ['OLD_FASHION', 'NEW_FASHION']) {
  test(`Clothing ${fashionType} has no expiry even when a client supplies one`, async () => {
    const product = new Product({ ...base, shopType: 'CLOTHING', fashionType, expiryDate: '2000-01-01' });
    await product.validate();
    assert.equal(product.expiryDate, null);
    assert.equal(product.fashionType, fashionType);
  });
}
test('Clothing requires a valid Old Fashion/New Fashion classification', async () => {
  for (const fashionType of [undefined, null, '', 'UNKNOWN']) {
    await assert.rejects(new Product({ ...base, shopType: 'CLOTHING', fashionType }).validate(), /fashionType/);
  }
});
test('Retailers, products and suppliers support exactly four store types', async () => {
  for (const shopType of ['MEDICAL', 'RESTAURANT', 'GROCERY', 'CLOTHING']) {
    assert.equal(validShopType(shopType), true);
    await new User({ name: 'Schema verification', email: 'schema@example.invalid', password: 'verification', shopType }).validate();
    await new Supplier({ name: 'Schema verification', createdBy: owner, shopType }).validate();
  }
  assert.equal(validShopType('OTHER'), false);
  for (const Model of [User, Supplier, Product]) {
    const fields = Model === User ? { name: 'Schema verification', email: 'schema@example.invalid', password: 'verification' } : base;
    await assert.rejects(new Model({ ...fields, shopType: 'OTHER' }).validate(), /shopType/);
  }
});
test('An unselected retailer stays unselected; legacy products need no fashion migration', async () => {
  const user = new User({ name: 'Schema verification', email: 'schema@example.invalid', password: 'verification' });
  await user.validate(); assert.equal(user.shopType, null);
  const legacy = Product.hydrate({ ...base, shopType: 'GROCERY', _id: new mongoose.Types.ObjectId() });
  await legacy.validate(); assert.equal(legacy.fashionType, null);
});
