const { scope } = require('../utils/storeScope');
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const StockTransaction = require("../models/StockTransaction");
function startDay(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function startWeek() {
  const x = startDay();
  const day = x.getUTCDay();
  x.setUTCDate(x.getUTCDate() - (day === 0 ? 6 : day - 1));
  return x;
}
function startMonth() {
  const x = new Date();
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1));
}
async function salesSummary(filter, start) {
  const [r] = await Sale.aggregate([
    { $match: { ...filter, date: { $gte: start, $lte: new Date() } } },
    {
      $group: {
        _id: null,
        totalSales: { $sum: "$totalAmount" },
        totalTransactions: { $sum: 1 },
        unitsSold: { $sum: "$quantity" },
      },
    },
  ]);
  return r || { totalSales: 0, totalTransactions: 0, unitsSold: 0 };
}
async function dashboard(req, res, next) {
  try {
    const filter = scope(req),
      today = startDay(),
      month = startMonth(),
      soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 30);
    const [
      totalProducts,
      totalAgg,
      todayAgg,
      monthAgg,
      lowStockCount,
      outOfStockCount,
      expiringCount,
      recentSales,
      recentTransactions,
    ] = await Promise.all([
      Product.countDocuments({ ...filter }),
      Product.aggregate([
        { $match: { ...filter } },
        {
          $group: {
            _id: null,
            totalStock: { $sum: "$quantity" },
            totalInventoryValue: {
              $sum: { $multiply: ["$quantity", "$purchasePrice"] },
            },
          },
        },
      ]),
      salesSummary(filter, today),
      salesSummary(filter, month),
      Product.countDocuments({
        ...filter,
        $expr: {
          $and: [
            { $lte: ["$quantity", "$minimumStock"] },
            { $gt: ["$quantity", 0] },
          ],
        },
      }),
      Product.countDocuments({ ...filter, quantity: 0 }),
      Product.countDocuments({
        ...filter,
        shopType: { $ne: 'CLOTHING' },
        expiryDate: { $gte: today, $lte: soon },
      }),
      Sale.find({ ...filter })
        .populate({ path: 'product', select: 'name sku', match: { ...filter } })
        .sort({ date: -1 })
        .limit(5),
      StockTransaction.find({ ...filter })
        .populate({ path: 'product', select: 'name sku', match: { ...filter } })
        .sort({ date: -1 })
        .limit(5),
    ]);
    res.json({
      totalProducts,
      totalStock: totalAgg[0]?.totalStock || 0,
      totalInventoryValue: totalAgg[0]?.totalInventoryValue || 0,
      todaySales: todayAgg.totalSales,
      monthlySales: monthAgg.totalSales,
      lowStockCount,
      outOfStockCount,
      expiringCount,
      recentSales,
      recentTransactions,
    });
  } catch (e) {
    next(e);
  }
}
const daily = async (req, res, next) => {
  try {
    res.json(await salesSummary(scope(req), startDay()));
  } catch (e) {
    next(e);
  }
};
const weekly = async (req, res, next) => {
  try {
    res.json(await salesSummary(scope(req), startWeek()));
  } catch (e) {
    next(e);
  }
};
const monthly = async (req, res, next) => {
  try {
    res.json(await salesSummary(scope(req), startMonth()));
  } catch (e) {
    next(e);
  }
};
async function inventory(req, res, next) {
  try {
    const items = await Product.find({ ...scope(req) })
      .populate({ path: 'supplier', select: 'name company', match: { ...scope(req) } })
      .sort({ name: 1 });
    const totalStock = items.reduce((a, p) => a + p.quantity, 0),
      totalInventoryValue = items.reduce(
        (a, p) => a + p.quantity * p.purchasePrice,
        0,
      );
    res.json({
      totalProducts: items.length,
      totalStock,
      totalInventoryValue,
      products: items,
    });
  } catch (e) {
    next(e);
  }
}
async function lowStock(req, res, next) {
  try {
    const products = await Product.find({
      ...scope(req),
      $expr: { $lte: ["$quantity", "$minimumStock"] },
    }).sort({ quantity: 1 });
    res.json(products);
  } catch (e) {
    next(e);
  }
}
async function expiry(req, res, next) {
  try {
    const today = startDay(),
      soon = new Date(today);
    soon.setUTCDate(soon.getUTCDate() + 30);
    const [expired, expiringSoon] = await Promise.all([
      Product.find({
        ...scope(req),
        shopType: { $ne: 'CLOTHING' },
        expiryDate: { $lt: today },
      }).sort({ expiryDate: 1 }),
      Product.find({
        ...scope(req),
        shopType: { $ne: 'CLOTHING' },
        expiryDate: { $gte: today, $lte: soon },
      }).sort({ expiryDate: 1 }),
    ]);
    res.json({ expired, expiringSoon });
  } catch (e) {
    next(e);
  }
}
module.exports = {
  dashboard,
  daily,
  weekly,
  monthly,
  inventory,
  lowStock,
  expiry,
};
