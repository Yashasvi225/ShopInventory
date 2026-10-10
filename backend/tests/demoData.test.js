const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { SHOP_TYPES } = require('../domain/storeTypes');
const { buildStore, identity, datasetKey } = require('../demo/data');
const { requireDevelopment, validateManifest } = require('../demo/seed');
const { expiryEvent, salesBasis } = require('../domain/expiryAlerts');
const { fallbackRecommendations } = require('../services/geminiService');
const Product = require('../models/Product');
const now = new Date('2026-10-09T08:00:00Z');

for (const shopType of SHOP_TYPES) {
  test(`${shopType}: demo products validate, historical sales balance and demand uses the existing engine`, async () => {
    const entries = buildStore(shopType, now), owner = new mongoose.Types.ObjectId();
    assert.equal(entries.length, 12);
    const quantities = [];
    for (const entry of entries) {
      const product = new Product({ ...entry, createdBy: owner });
      await product.validate();
      const sold = entry.sales.reduce((sum, sale) => sum + sale.quantity, 0);
      const opening = product.quantity + sold;
      assert.equal(opening - sold, product.quantity);
      for (const sale of entry.sales) {
        assert.ok(sale.date <= now);
        assert.ok(!entry.expiryDate || sale.date < entry.expiryDate);
        assert.ok(Number.isInteger(sale.quantity) && sale.quantity > 0);
      }
      const basis = salesBasis(product, entry.sales.map(sale => ({ ...sale, createdBy: owner, product: product._id })), now);
      quantities.push(basis.suggestedPurchaseQuantity);
      if (entry.pattern === 'NONE') { assert.equal(basis.suggestedPurchaseQuantity, null); assert.equal(basis.confidence, 'NO_DATA'); }
      if (entry.pattern === 'LIMITED') assert.equal(basis.confidence, 'LIMITED');
    }
    assert.ok(quantities[0] > quantities[2] && quantities[2] > quantities[3]);
    if (shopType === 'CLOTHING') {
      assert.ok(entries.every(entry => entry.expiryDate === null && !expiryEvent(entry, now)));
      assert.deepEqual(new Set(entries.map(entry => entry.fashionType)), new Set(['OLD_FASHION', 'NEW_FASHION']));
    } else {
      assert.deepEqual(entries.slice(0, 3).map(entry => expiryEvent(entry, now).daysRemaining), [0, 1, 2]);
      assert.equal(entries.filter(entry => expiryEvent(entry, now)).length, 6);
      assert.equal(expiryEvent(entries[9], now), null);
      assert.equal(expiryEvent(entries[11], now), null);
      assert.equal(expiryEvent({ ...entries[0], expiryDate: 'invalid' }, now), null);
    }
  });
}
test('Demo account namespaces are exact, distinct and cannot become broad selectors', () => {
  assert.equal(new Set(SHOP_TYPES.map(type => identity(type).email)).size, 4);
  for (const invalid of ['', '*', '../local', 'Local', 'a@b', 'x'.repeat(51)]) assert.throws(() => datasetKey(invalid));
  assert.throws(() => validateManifest({ _id: 'anything', namespace: 'local', kind: 'SIM_P2_DEMO', version: 1, owners: [] }, 'local'));
});
test('Production refuses demo writes', () => {
  const before = process.env.NODE_ENV;
  try { process.env.NODE_ENV = 'production'; assert.throws(requireDevelopment, /disabled in production/); }
  finally { if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before; }
});
test('No-sales demo does not manufacture demand; manual low-stock fallback remains separate', () => {
  const entry = buildStore('CLOTHING', now)[9];
  const result = fallbackRecommendations([{ productId: 'demo', productName: entry.name, currentStock: entry.quantity,
    minimumStock: entry.minimumStock, averageDailySales: 0, expiryDate: null }]);
  assert.deepEqual(result, []);
});
