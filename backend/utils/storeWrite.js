const mongoose = require('mongoose');
const Store = require('../models/Store');
const { scope } = require('./storeScope');
// A shared Store write makes a legacy empty-store conversion conflict with
// in-flight inventory writes. Transactions retry instead of creating dangling scopes.
function storeTransaction(req, work) {
  const filter = scope(req);
  return mongoose.connection.transaction(async session => {
    const store = await Store.findOneAndUpdate({ _id: filter.store, createdBy: filter.createdBy, shopType: req.store.shopType },
      { $inc: { writeVersion: 1 } }, { session, new: true });
    if (!store) { const error = new Error('Store not found'); error.statusCode = 404; throw error; }
    return work(session);
  });
}
module.exports = { storeTransaction };
