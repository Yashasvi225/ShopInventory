const { scope } = require('../utils/storeScope');
const ExpiryAlert = require('../models/ExpiryAlert');
const { syncAlerts, scheduleRecommendations } = require('../services/expiryAlertService');
const { expiryEvent } = require('../domain/expiryAlerts');
const { isValidObjectId } = require('../utils/validators');

async function getExpiryAlerts(req, res, next) {
  try {
    const now = new Date();
    const products = await syncAlerts(req.store, now);
    const current = new Map(products.map(product => [String(product._id), product]));
    const saved = await ExpiryAlert.find({ ...scope(req), dismissedAt: null,
      product: { $in: products.map(product => product._id) } }).sort({ expiryDay: 1, createdAt: 1 }).lean();
    const alerts = saved.flatMap(alert => {
      const product = current.get(String(alert.product));
      const event = product && expiryEvent(product, now);
      if (!event || event.expiryDay !== alert.expiryDay) return [];
      return [{ _id: alert._id, productId: product._id, productName: product.name, shopType: product.shopType,
        ...event, currentStock: product.quantity, createdAt: alert.createdAt,
        recommendationStatus: alert.recommendationStatus, recommendation: alert.recommendation }];
    });
    scheduleRecommendations();
    res.json({ alerts, checkedAt: now.toISOString(), dateBasis: 'UTC_CALENDAR_DAY' });
  } catch (error) { next(error); }
}

async function dismissExpiryAlert(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid alert ID' });
    const alert = await ExpiryAlert.findOneAndUpdate({ _id: req.params.id, ...scope(req) },
      { $set: { dismissedAt: new Date() } }, { new: true });
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    res.json({ message: 'Expiry alert dismissed' });
  } catch (error) { next(error); }
}

module.exports = { getExpiryAlerts, dismissExpiryAlert };
