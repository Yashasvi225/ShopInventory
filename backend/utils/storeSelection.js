const { SHOP_TYPES } = require('../domain/storeTypes');
const { badRequest } = require('./validators');
function selectedStores(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > SHOP_TYPES.length ||
      value.some(type => !SHOP_TYPES.includes(type)) || new Set(value).size !== value.length) {
    throw badRequest('Select at least one supported store, without duplicates.');
  }
  return value;
}
module.exports = { selectedStores };
