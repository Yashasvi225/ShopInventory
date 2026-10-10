const { randomUUID } = require('node:crypto');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const User = require('../models/User');
const Store = require('../models/Store');
const ExpiryAlert = require('../models/ExpiryAlert');
const { EXPIRY_STORES, expiryEvent, utcDay, salesWindow, salesBasis, basisExplanation } = require('../domain/expiryAlerts');
const { generateExpiryRecommendation } = require('./geminiService');

const SCAN_MS = 15 * 60_000;
const MAX_ATTEMPTS = 3;
let running = false;
let requested = false;

function dateRange(now) {
  const from = new Date(utcDay(now));
  return { $gte: from, $lt: new Date(from.getTime() + 3 * 86_400_000) };
}

async function eligibleProducts(owner, now = new Date()) {
  if (owner && !EXPIRY_STORES.includes(owner.shopType)) return [];
  const products = await Product.find({ ...(owner ? { createdBy: owner.createdBy, store: owner._id, shopType: owner.shopType }
    : { shopType: { $in: EXPIRY_STORES } }), expiryDate: dateRange(now) }).lean();
  if (owner) return products;
  const stores = await Store.find({ _id: { $in: products.map(product => product.store) }, shopType: { $in: EXPIRY_STORES } }).lean();
  const users = await User.find({ _id: { $in: stores.map(store => store.createdBy) } }).select('_id').lean();
  const owners = new Set(users.map(user=>String(user._id)));
  const configured = new Map(stores.map(store=>[String(store._id),store]));
  return products.filter(product=>{const store=configured.get(String(product.store));return store&&owners.has(String(store.createdBy))&&String(store.createdBy)===String(product.createdBy)&&store.shopType===product.shopType});
}

async function syncAlerts(owner, now = new Date()) {
  const products = await eligibleProducts(owner, now);
  if (!products.length) return products;
  const saved = await ExpiryAlert.find({ ...(owner ? { createdBy: owner.createdBy, store: owner._id } : {}),
    product: { $in: products.map(product => product._id) },
    expiryDay: { $gte: utcDay(now), $lte: utcDay(new Date(now.getTime() + 2 * 86_400_000)) },
  }).select('createdBy product expiryDay').lean();
  const existing = new Set(saved.map(alert => `${alert.createdBy}:${alert.product}:${alert.expiryDay}`));
  for (const product of products) {
    const event = expiryEvent(product, now);
    if (!event) continue;
    const identity = { createdBy: product.createdBy, product: product._id, expiryDay: event.expiryDay };
    if (existing.has(`${product.createdBy}:${product._id}:${event.expiryDay}`)) continue;
    try {
      await ExpiryAlert.updateOne(identity, { $setOnInsert: { ...identity, store: product.store, shopType: product.shopType } }, { upsert: true });
    } catch (error) { if (error.code !== 11000) throw error; } // A competing scan inserted this same event.
  }
  return products;
}

async function processAlert(id, generate = generateExpiryRecommendation, now = new Date()) {
  const claim = randomUUID();
  const alert = await ExpiryAlert.findOneAndUpdate({ _id: id, dismissedAt: null, attempts: { $lt: MAX_ATTEMPTS }, $or: [
    { recommendationStatus: 'PENDING' },
    { recommendationStatus: 'UNAVAILABLE', retryAt: { $lte: now } },
    { recommendationStatus: 'GENERATING', leaseUntil: { $lte: now } },
  ] }, { $set: { recommendationStatus: 'GENERATING', leaseUntil: new Date(now.getTime() + 120_000), claim },
    $inc: { attempts: 1 } }, { new: true }).lean();
  if (!alert) return;
  const claimed = { _id: alert._id, createdBy: alert.createdBy, claim };
  try {
    const store = await Store.findOne({ _id: alert.store, createdBy: alert.createdBy, shopType: alert.shopType }).lean();
    const owner = store && await User.findById(alert.createdBy).select('_id').lean();
    const product = owner && await Product.findOne({ _id: alert.product, createdBy: owner._id, store: store._id, shopType: store.shopType }).lean();
    const event = product && expiryEvent(product, now);
    if (!event || event.expiryDay !== alert.expiryDay) {
      // Deleted/changed/expired products never produce a recommendation.
      await ExpiryAlert.updateOne(claimed, { $set: { recommendationStatus: 'NO_DATA', leaseUntil: null, claim: null } });
      return;
    }
    const sales = await Sale.find({ createdBy: owner._id, store: store._id, product: product._id,
      date: { $gte: salesWindow(now), $lte: now } }).select('product quantity date createdBy').lean();
    const basis = salesBasis(product, sales, now);
    const base = { salesBasis: basis, explanation: basisExplanation(basis), generatedAt: now.toISOString(),
      suggestedPurchaseQuantity: basis.suggestedPurchaseQuantity, source: 'APPLICATION' };
    // Save the trustworthy estimate before calling the external service. Even a
    // timeout or a process restart leaves the expiry warning and sales basis.
    await ExpiryAlert.updateOne(claimed, { $set: { recommendation: base } });
    if (basis.suggestedPurchaseQuantity == null) {
      await ExpiryAlert.updateOne(claimed, { $set: { recommendationStatus: 'NO_DATA', leaseUntil: null, claim: null } });
      return;
    }
    const result = await generate({ productId: String(product._id), productName: product.name,
      shopType: product.shopType, currentStock: product.quantity, expiryDay: event.expiryDay,
      daysRemaining: event.daysRemaining, salesBasis: basis });
    await ExpiryAlert.updateOne(claimed, { $set: { recommendationStatus: 'READY',
      recommendation: { ...base, ...result, explanation: `${base.explanation} ${result.explanation}` },
      leaseUntil: null, retryAt: null, claim: null } });
  } catch (error) {
    // No raw provider payloads, credentials, product names or connection strings.
    console.warn('Expiry recommendation unavailable', { alertId: String(alert._id),
      code: ['TIMEOUT', 'INVALID_RESPONSE', 'NOT_CONFIGURED'].includes(error.code) ? error.code
        : error.name === 'SyntaxError' ? 'INVALID_RESPONSE' : 'PROVIDER_OR_DATABASE_ERROR',
      ...(Number.isInteger(error.status) ? { status: error.status } : {}) });
    await ExpiryAlert.updateOne(claimed, { $set: { recommendationStatus: 'UNAVAILABLE',
      retryAt: new Date(now.getTime() + SCAN_MS), leaseUntil: null, claim: null } });
  }
}

// One worker per process; atomic database claims also protect across processes.
// Requests schedule work but never wait for Gemini, so warnings remain visible.
async function workPending() {
  if (running) { requested = true; return; }
  running = true;
  try {
    do {
      requested = false;
      const now = new Date();
      const today = utcDay(now);
      const end = utcDay(new Date(Date.parse(today) + 2 * 86_400_000));
      // Recover a worker that died on its final attempt rather than leaving a
      // permanently spinning GENERATING notification after its lease expires.
      await ExpiryAlert.updateMany({ recommendationStatus: 'GENERATING', attempts: { $gte: MAX_ATTEMPTS },
        leaseUntil: { $lte: now } }, { $set: { recommendationStatus: 'UNAVAILABLE', leaseUntil: null, claim: null } });
      const alerts = await ExpiryAlert.find({ expiryDay: { $gte: today, $lte: end }, dismissedAt: null,
        attempts: { $lt: MAX_ATTEMPTS }, $or: [ { recommendationStatus: 'PENDING' },
          { recommendationStatus: 'UNAVAILABLE', retryAt: { $lte: now } },
          { recommendationStatus: 'GENERATING', leaseUntil: { $lte: now } } ] }).select('_id').lean();
      for (const alert of alerts) await processAlert(alert._id);
    } while (requested);
  } catch { console.warn('Expiry background scan failed; it will retry on the next interval.'); }
  finally { running = false; }
}

function scheduleRecommendations() { void workPending(); }

function startExpiryScanner() {
  let scanning = false;
  const scan = async () => {
    if (scanning) return;
    scanning = true;
    try { await syncAlerts(); scheduleRecommendations(); }
    catch { console.warn('Expiry detection failed; it will retry on the next interval.'); }
    finally { scanning = false; }
  };
  void scan();
  const timer = setInterval(scan, SCAN_MS);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { syncAlerts, processAlert, scheduleRecommendations, startExpiryScanner };
