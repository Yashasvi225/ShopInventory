const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { BSON, ObjectId } = require('mongoose').mongo;
const { cleanFields } = require('../migrations/grocery');
const { readBackup, localPath } = require('../migrations/backup');
test('Grocery presentation fields normalize without altering real names, prices or transaction links', () => {
  assert.deepEqual(cleanFields('products', { name: '[DEMO] Milk', sku: 'DEMO-GROCERY-01', description: 'DEMO only. Sales pattern: FAST. Synthetic history for the existing application calculations.' }), { name: 'Milk', sku: 'GROCERY-01', description: '' });
  assert.deepEqual(cleanFields('products', { name: 'Real product', sku: 'REAL-01', description: 'Useful details' }), { name: 'Real product', sku: 'REAL-01', description: 'Useful details' });
  assert.deepEqual(cleanFields('suppliers', { name: '[DEMO] GROCERY Supplier 1', company: 'Demo supplier 1', email: 'demo-supplier-1@example.invalid', address: 'Demo address - sample only' }), { name: 'Grocery Supplier 1', company: '', email: '', address: '' });
  assert.deepEqual(cleanFields('stocktransactions', { reason: 'DEMO: Opening inventory (synthetic history)' }), { reason: 'Opening inventory' });
  assert.deepEqual(cleanFields('stocktransactions', { reason: 'Sale 012345678901234567890123' }), {});
});
test('Backup paths are confined to SIM_P2 and unrecognized files are refused', () => {
  assert.throws(() => localPath(path.resolve(__dirname, '../../../outside-backup.json')), /inside SIM_P2/);
  const dir = path.resolve(__dirname, '../test-results'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `bad-backup-${randomUUID()}.json`);
  try { fs.writeFileSync(file, '{}'); assert.throws(() => readBackup(file), /Unrecognized/); }
  finally { fs.unlinkSync(file); }
});
test('BSON backup representation preserves ObjectIds and dates', () => {
  const data = { _id: new ObjectId(), date: new Date('2026-10-09T00:00:00.000Z'), quantity: 12, nullable: null };
  const roundTrip = BSON.deserialize(BSON.serialize(data));
  assert.ok(roundTrip._id.equals(data._id)); assert.equal(+roundTrip.date, +data.date); assert.equal(roundTrip.quantity, 12);
});
