const mongoose = require('mongoose');
const { SHOP_TYPES } = require('../domain/storeTypes');
const schema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  shopType: { type: String, enum: SHOP_TYPES, required: true, immutable: true },
  name: { type: String, trim: true, default: '' },
  writeVersion: { type: Number, default: 0, select: false },
}, { timestamps: true, versionKey: false });
schema.index({ createdBy: 1, shopType: 1 }, { unique: true });
module.exports = mongoose.model('Store', schema);
