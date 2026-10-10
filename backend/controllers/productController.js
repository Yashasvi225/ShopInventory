const { scope } = require('../utils/storeScope');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const { storeTransaction } = require('../utils/storeWrite');
const { isValidObjectId, requiredString, nonNegative, validShopType, optionalString, validDate, literalSearch } = require('../utils/validators');

function productStoreType(req) {
  const shopType = req.store.shopType;
  if (!validShopType(shopType)) {
    const error = new Error('Select a shop type before managing products.'); error.statusCode = 400; throw error;
  }
  if (req.body.shopType !== undefined && (typeof req.body.shopType !== 'string' || req.body.shopType.toUpperCase() !== shopType)) {
    const error = new Error('Product store type must match your shop.'); error.statusCode = 400; throw error;
  }
  if (shopType !== 'CLOTHING' && req.body.fashionType != null && req.body.fashionType !== '') {
    const error = new Error('Fashion classification is only available for Clothing products.'); error.statusCode = 400; throw error;
  }
  return shopType;
}

async function validateSupplier(id, req, shopType, session) {
  if (id === undefined || id === null || id === '') return null;
  if (!isValidObjectId(id)) { const e = new Error('Invalid supplier ID'); e.statusCode = 400; throw e; }
  const supplier = await Supplier.findOne({ _id: id, ...scope(req) }).session(session);
  if (!supplier) { const e = new Error('Supplier not found'); e.statusCode = 404; throw e; }
  if (supplier.shopType !== shopType) { const e = new Error('Supplier store type must match your shop.'); e.statusCode = 400; throw e; }
  return supplier._id;
}

async function getProducts(req, res, next) {
  try {
    const filter = { ...scope(req) };
    const search = literalSearch(req.query.search);
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { sku: { $regex: search, $options: 'i' } }];
    if (req.query.category !== undefined) filter.category = optionalString(req.query.category, 'category');
    const products = await Product.find(filter).populate({ path: 'supplier', select: 'name company', match: { ...scope(req) } }).sort({ createdAt: -1 });
    res.json(products);
  } catch (e) { next(e); }
}

async function createProduct(req, res, next) {
  try {
    const shopType = productStoreType(req);
    const product = await storeTransaction(req, async session => {
    const supplier = await validateSupplier(req.body.supplier, req, shopType, session);
    const [created] = await Product.create([{
      name: requiredString(req.body.name, 'name'), sku: requiredString(req.body.sku, 'SKU'),
      category: optionalString(req.body.category, 'category'), description: optionalString(req.body.description, 'description'),
      purchasePrice: nonNegative(req.body.purchasePrice === undefined ? 0 : req.body.purchasePrice, 'purchasePrice'),
      sellingPrice: nonNegative(req.body.sellingPrice, 'sellingPrice'),
      quantity: nonNegative(req.body.quantity === undefined ? 0 : req.body.quantity, 'quantity'),
      minimumStock: nonNegative(req.body.minimumStock === undefined ? 0 : req.body.minimumStock, 'minimumStock'),
      supplier, expiryDate: shopType === 'CLOTHING' ? null : validDate(req.body.expiryDate, 'expiryDate', true),
      fashionType: shopType === 'CLOTHING' ? req.body.fashionType : null,
      shopType, ...scope(req)
    }], { session });
    return created;
    });
    res.status(201).json(product);
  } catch (e) { next(e); }
}

async function getProduct(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid product ID' });
    const p = await Product.findOne({ _id: req.params.id, ...scope(req) }).populate({ path: 'supplier', select: 'name company', match: { ...scope(req) } });
    if (!p) return res.status(404).json({ message: 'Product not found' });
    res.json(p);
  } catch (e) { next(e); }
}

async function updateProduct(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid product ID' });
    const result = await storeTransaction(req, async session => {
    const p = await Product.findOne({ _id: req.params.id, ...scope(req) }).session(session);
    if (!p) { const error = new Error('Product not found'); error.statusCode = 404; throw error; }
    const originalQuantity = p.quantity;
    if (req.body.expectedQuantity !== undefined && nonNegative(req.body.expectedQuantity, 'expectedQuantity') !== originalQuantity) {
      const error = new Error('Stock changed while this form was open. Reload the product before saving.'); error.statusCode = 409; throw error;
    }
    const shopType = productStoreType(req);
    if (p.shopType !== shopType) { const error = new Error('This product belongs to a different store type. Its existing data has not been changed.'); error.statusCode = 409; throw error; }
    if (req.body.name !== undefined) p.name = requiredString(req.body.name, 'name');
    if (req.body.sku !== undefined) p.sku = requiredString(req.body.sku, 'SKU');
    if (req.body.category !== undefined) p.category = optionalString(req.body.category, 'category');
    if (req.body.description !== undefined) p.description = optionalString(req.body.description, 'description');
    for (const f of ['purchasePrice','sellingPrice','quantity','minimumStock']) if (req.body[f] !== undefined) p[f] = nonNegative(req.body[f], f);
    if (req.body.supplier !== undefined) p.supplier = await validateSupplier(req.body.supplier, req, shopType, session);
    if (shopType === 'CLOTHING') {
      p.expiryDate = null;
      if (req.body.fashionType !== undefined) p.fashionType = req.body.fashionType;
    } else {
      if (req.body.expiryDate !== undefined) p.expiryDate = validDate(req.body.expiryDate, 'expiryDate', true);
      p.fashionType = null;
    }
    if (req.body.quantity !== undefined) {
      await p.validate();
      const changes = Object.fromEntries(p.modifiedPaths().map(field => [field, p.get(field)]));
      const updated = await Product.findOneAndUpdate({ _id: p._id, ...scope(req), quantity: originalQuantity },
        { $set: changes }, { new: true, session }); // Document validation above preserves conditional clothing validators.
      if (!updated) { const error = new Error('Stock changed while this form was open. Reload the product before saving.'); error.statusCode = 409; throw error; }
      return updated;
    } else { await p.save({ session }); return p; }
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function deleteProduct(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid product ID' });
    const p = await storeTransaction(req, session => Product.findOneAndDelete({ _id: req.params.id, ...scope(req) }, { session }));
    if (!p) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (e) { next(e); }
}
module.exports = { getProducts, createProduct, getProduct, updateProduct, deleteProduct };
