const Store = require('../models/Store');
async function listStores(req, res, next) {
  try { res.json({ stores: await Store.find({ createdBy: req.user._id }).sort({ createdAt: 1, _id: 1 }) }); }
  catch (error) { next(error); }
}
module.exports = { listStores };
