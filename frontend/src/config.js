export const categories = {
  GROCERY: ['Food Products', 'Beverages', 'FMCG', 'Personal Care', 'Household Products'],
  MEDICAL: ['Tablets', 'Capsules', 'Syrups', 'Injections', 'First Aid', 'Medical Supplies'],
};
export const stores = {
  MEDICAL: { label: 'Medical Store', description: 'Medicines, medical supplies, expiry and expired-product warnings.' },
  RESTAURANT: { label: 'Restaurant', description: 'Product stock, expiry dates, inventory and sales.' },
  GROCERY: { label: 'Grocery Store', description: 'Food, beverages, FMCG, personal care and household products.' },
  CLOTHING: { label: 'Clothing Store', description: 'Clothing stock organized as Old Fashion and New Fashion.' },
};
export const usesExpiry = shopType => ['MEDICAL', 'RESTAURANT', 'GROCERY'].includes(shopType);
export const fashionTypes = { OLD_FASHION: 'Old Fashion', NEW_FASHION: 'New Fashion' };
export const productAttribute = (product, shopType = product?.shopType) => shopType === 'CLOTHING'
  ? fashionTypes[product?.fashionType] || '—' : date(product?.expiryDate);
export const money = value => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number(value) || 0);
export const date = value => value ? new Date(value).toLocaleDateString('en-IN') : '—';
export const today = () => new Date().toISOString().slice(0, 10);
export function stockStatus(product) {
  if (product.quantity === 0) return ['Out', 'out'];
  if (product.quantity <= product.minimumStock) return ['Low', 'warn'];
  return ['In Stock', 'ok'];
}
