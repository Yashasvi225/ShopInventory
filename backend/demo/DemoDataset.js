const mongoose = require('mongoose');
const { SHOP_TYPES } = require('../domain/storeTypes');
const ids = [{ type: mongoose.Schema.Types.ObjectId, required: true }];
const owner = new mongoose.Schema({
  shopType: { type: String, enum: SHOP_TYPES, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  email: { type: String, required: true }, name: { type: String, required: true },
  productIds: ids, supplierIds: ids, saleIds: ids, stockIds: ids,
}, { _id: false });
module.exports = mongoose.model('DemoDataset', new mongoose.Schema({
  _id: { type: String, required: true }, kind: { type: String, enum: ['SIM_P2_DEMO'], required: true },
  version: { type: Number, required: true }, namespace: { type: String, required: true },
  seedDay: { type: String, required: true }, seededAt: { type: Date, required: true },
  owners: { type: [owner], required: true },
}, { versionKey: false, collection: 'demodatasets' }));
