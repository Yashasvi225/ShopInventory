const mongoose = require('mongoose');
const { SHOP_TYPES } = require('../domain/storeTypes');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  company: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  address: { type: String, trim: true, default: '' },
  shopType: { type: String, enum: SHOP_TYPES, required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

supplierSchema.index({ createdBy: 1, name: 1 });
supplierSchema.index({ createdBy: 1, store: 1 });
module.exports = mongoose.model('Supplier', supplierSchema);
