const { scope } = require('./storeScope');
const { storeTransaction } = require('./storeWrite');
const Product = require('../models/Product');
const { validShopType, badRequest } = require('./validators');

async function ownedStockProduct(productId, req, session) {
  if (!validShopType(req.store.shopType)) throw badRequest('Select a shop type before managing stock.');
  const product = await Product.findOne({ _id: productId, ...scope(req) }).session(session);
  if (!product) { const error = new Error('Product not found'); error.statusCode = 404; throw error; }
  if (product.shopType !== req.store.shopType) {
    const error = new Error('This product belongs to a different store type.'); error.statusCode = 409; throw error;
  }
  return product;
}

// The configured MongoDB is a replica set. Fail closed instead of performing
// partial stock/history writes if a deployment cannot provide transactions.
function stockTransaction(req, work) { return storeTransaction(req, work); }
module.exports = { ownedStockProduct, stockTransaction };
