const { scope } = require('../utils/storeScope');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const { getReorderRecommendations } = require('../services/geminiService');

function startOfDaysAgo(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

async function reorderSuggestions(req, res, next) {
  try {
    const products = await Product.find({ ...scope(req) }).lean();
    if (!products.length) {
      return res.json({ suggestions: [], source: 'NO_DATA', generatedAt: new Date().toISOString() });
    }

    const since30 = startOfDaysAgo(29);
    const since14 = startOfDaysAgo(13);
    const since7 = startOfDaysAgo(6);
    const sales = await Sale.find({
      ...scope(req),
      date: { $gte: since30, $lte: new Date() },
      product: { $in: products.map(p => p._id) }
    }).select('product quantity date').lean();

    const stats = new Map();
    for (const sale of sales) {
      const key = String(sale.product);
      const s = stats.get(key) || { qty30: 0, qty7: 0, previous7: 0, saleCount: 0, saleDays: new Set() };
      const date = new Date(sale.date);
      s.qty30 += sale.quantity;
      s.saleCount += 1;
      s.saleDays.add(date.toISOString().slice(0, 10));
      if (date >= since7) s.qty7 += sale.quantity;
      else if (date >= since14) s.previous7 += sale.quantity;
      stats.set(key, s);
    }

    const items = products.map(product => {
      const s = stats.get(String(product._id)) || { qty30: 0, qty7: 0, previous7: 0, saleCount: 0, saleDays: new Set() };
      const averageDailySales = s.qty30 / 30;
      const salesFrequency = s.saleDays.size / 30;
      let trend = 'STABLE';
      if (s.qty7 > s.previous7 * 1.2) trend = 'RISING';
      else if (s.previous7 > 0 && s.qty7 < s.previous7 * 0.8) trend = 'FALLING';
      else if (s.qty7 === 0 && s.previous7 === 0) trend = 'NO_RECENT_SALES';
      return {
        productId: String(product._id),
        productName: product.name,
        sku: product.sku,
        category: product.category,
        shopType: product.shopType,
        currentStock: product.quantity,
        minimumStock: product.minimumStock,
        expiryDate: product.shopType === 'CLOTHING' ? null : product.expiryDate,
        recentSales30Days: s.qty30,
        averageDailySales: Number(averageDailySales.toFixed(2)),
        salesFrequency: Number(salesFrequency.toFixed(2)),
        demandTrend: trend,
        demandObservation: `${s.qty30} units sold in the last 30 days across ${s.saleDays.size} sale day(s); trend is ${trend.toLowerCase().replaceAll('_', ' ')}.`
      };
    });

    const result = await getReorderRecommendations(items, req.store.shopType);
    res.json({ ...result, generatedAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

module.exports = { reorderSuggestions };
