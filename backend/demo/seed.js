const mongoose = require("mongoose");
const User = require("../models/User");
const Store = require("../models/Store");
const Product = require("../models/Product");
const Supplier = require("../models/Supplier");
const Sale = require("../models/Sale");
const Stock = require("../models/StockTransaction");
const Alert = require("../models/ExpiryAlert");
const Dataset = require("./DemoDataset");
const { SHOP_TYPES } = require("../domain/storeTypes");
const { utcDay } = require("../domain/expiryAlerts");
const { syncAlerts, processAlert } = require("../services/expiryAlertService");
const {
  DEFAULT_NAMESPACE,
  PRESENTATION_NAMESPACE,
  VERSION,
  datasetKey,
  identity,
  buildStore,
} = require("./data");
const {
  validatedEmail,
  registrationPassword,
} = require("../utils/authValidation");
const ownedModels = [
  [Product, "productIds"],
  [Supplier, "supplierIds"],
  [Sale, "saleIds"],
  [Stock, "stockIds"],
];
const { assertDatasetUnmigrated } = require("../migrations/guard");

function requireDevelopment() {
  if ((process.env.NODE_ENV || "").toLowerCase() === "production")
    throw new Error("Demo operations are disabled in production");
}
function validateManifest(manifest, namespace) {
  if (
    !manifest ||
    manifest._id !== datasetKey(namespace) ||
    manifest.namespace !== namespace ||
    manifest.kind !== "SIM_P2_DEMO" ||
    manifest.version !== VERSION ||
    manifest.owners.length !== SHOP_TYPES.length
  )
    throw new Error("Unverified demo manifest; refusing changes");
  const unique = new Set();
  for (const type of SHOP_TYPES) {
    const owners = manifest.owners.filter((owner) => owner.shopType === type);
    if (owners.length !== 1) throw new Error("Invalid demo owner manifest");
    const owner = owners[0],
      expected = identity(type, namespace);
    if (owner.email !== expected.email || owner.name !== expected.name)
      throw new Error("Demo identity mismatch");
    for (const id of [
      owner.userId,
      ...ownedModels.flatMap(([, field]) => owner[field] || []),
    ]) {
      if (!mongoose.isValidObjectId(id) || unique.has(String(id)))
        throw new Error("Invalid or duplicate manifest ID");
      unique.add(String(id));
    }
    if (
      owner.productIds?.length !== 12 ||
      owner.supplierIds?.length !== 3 ||
      !owner.saleIds?.length ||
      !owner.stockIds?.length
    )
      throw new Error("Incomplete demo manifest");
  }
}
async function verifyOwnership(manifest, session, cleanup = false) {
  validateManifest(manifest, manifest.namespace);
  await assertDatasetUnmigrated(manifest._id, session);
  for (const owner of manifest.owners) {
    const user = await User.findById(owner.userId).session(session).lean();
    if (
      (!user && !cleanup) ||
      (user &&
        (user.email !== owner.email ||
          user.name !== owner.name ||
          user.shopType !== owner.shopType))
    )
      throw new Error("Demo account identity changed; refusing changes");
    const productIds = new Set(owner.productIds.map(String)),
      supplierIds = new Set(owner.supplierIds.map(String));
    for (const [Model, field] of ownedModels) {
      const records = await Model.find({ _id: { $in: owner[field] } })
        .session(session)
        .lean();
      for (const record of records) {
        if (
          String(record.createdBy) !== String(owner.userId) ||
          (record.shopType && record.shopType !== owner.shopType) ||
          (record.product && !productIds.has(String(record.product))) ||
          (record.supplier && !supplierIds.has(String(record.supplier)))
        )
          throw new Error(
            "Manifest record ownership/relationship mismatch; refusing changes",
          );
      }
      if (
        cleanup &&
        (await Model.exists({
          createdBy: owner.userId,
          _id: { $nin: owner[field] },
        }).session(session))
      )
        throw new Error(
          "Untracked records exist in a demo account; cleanup refused to preserve them",
        );
    }
    if (cleanup) {
      if (
        await Alert.exists({
          createdBy: owner.userId,
          product: { $nin: owner.productIds },
        }).session(session)
      )
        throw new Error("Untracked demo alerts; cleanup refused");
      for (const Model of [Sale, Stock, Alert]) {
        if (
          await Model.exists({
            product: { $in: owner.productIds },
            createdBy: { $ne: owner.userId },
          }).session(session)
        )
          throw new Error(
            "Foreign references to demo products; cleanup refused",
          );
      }
      if (
        await Product.exists({
          supplier: { $in: owner.supplierIds },
          createdBy: { $ne: owner.userId },
        }).session(session)
      )
        throw new Error(
          "Foreign references to demo suppliers; cleanup refused",
        );
    }
  }
}
async function offlineExplanation() {
  const error = new Error(
    "Demo seed computes application estimates without contacting Gemini",
  );
  error.code = "NOT_CONFIGURED";
  throw error;
}
async function prepareAlerts(manifest, now, generate = offlineExplanation) {
  // Existing persisted estimates are never overwritten on a repeated run.
  for (const owner of manifest.owners) {
    const store = await Store.findOne({
      createdBy: owner.userId,
      shopType: owner.shopType,
    }).lean();
    if (!store)
      throw new Error(
        "Demo store relationship is missing; run the verified store backfill.",
      );
    await syncAlerts(store, now);
    const pending = await Alert.find({
      createdBy: owner.userId,
      product: { $in: owner.productIds },
      recommendationStatus: "PENDING",
      dismissedAt: null,
    })
      .select("_id")
      .lean();
    for (const alert of pending) await processAlert(alert._id, generate, now);
  }
}
async function summary(manifest) {
  return Promise.all(
    manifest.owners.map(async (owner) => ({
      shopType: owner.shopType,
      email: owner.email,
      products: await Product.countDocuments({
        _id: { $in: owner.productIds },
        createdBy: owner.userId,
      }),
      suppliers: await Supplier.countDocuments({
        _id: { $in: owner.supplierIds },
        createdBy: owner.userId,
      }),
      sales: await Sale.countDocuments({
        _id: { $in: owner.saleIds },
        createdBy: owner.userId,
      }),
      stockTransactions: await Stock.countDocuments({
        _id: { $in: owner.stockIds },
        createdBy: owner.userId,
      }),
      expiryAlerts: await Alert.countDocuments({
        product: { $in: owner.productIds },
        createdBy: owner.userId,
      }),
    })),
  );
}
async function seedDemo({
  namespace = DEFAULT_NAMESPACE,
  password,
  passwords,
  now = new Date(),
  generate,
} = {}) {
  requireDevelopment();
  const key = datasetKey(namespace);
  const passwordFor = (type) =>
    passwords === undefined ? password : passwords?.[type];
  for (const type of SHOP_TYPES) {
    const candidate = passwordFor(type);
    if (
      typeof candidate !== "string" ||
      !candidate.length ||
      Buffer.byteLength(candidate, "utf8") > 72
    )
      throw new Error(
        "Demo credentials are missing or exceed the 72 UTF-8-byte limit",
      );
  }
  if (
    namespace === PRESENTATION_NAMESPACE &&
    new Set(SHOP_TYPES.map(passwordFor)).size !== SHOP_TYPES.length
  )
    throw new Error("Each presentation account must have a unique password");
  await Promise.all(
    [User, Store, Product, Supplier, Sale, Stock, Alert, Dataset].map((Model) =>
      Model.init(),
    ),
  );
  let inserted = false;
  const manifest = await mongoose.connection.transaction(async (session) => {
    inserted = false;
    const existing = await Dataset.findById(key).session(session).lean();
    if (existing) {
      await verifyOwnership(existing, session);
      for (const owner of existing.owners) {
        const user = await User.findById(owner.userId)
          .select("+password")
          .session(session);
        if (!(await user.comparePassword(passwordFor(owner.shopType))))
          throw new Error(
            "Demo password does not match existing accounts; accounts were not overwritten. Restore credentials or explicitly clean up the demo.",
          );
      }
      return existing;
    }
    // The unique dataset key serializes concurrent seeds; the entire dataset commits atomically.
    const [claim] = await Dataset.create(
      [
        {
          _id: key,
          kind: "SIM_P2_DEMO",
          version: VERSION,
          namespace,
          seedDay: utcDay(now),
          seededAt: now,
          owners: [],
        },
      ],
      { session },
    );
    for (const shopType of SHOP_TYPES) {
      const account = identity(shopType, namespace);
      validatedEmail(account.email);
      const accountPassword = registrationPassword(passwordFor(shopType));
      if (await User.exists({ email: account.email }).session(session))
        throw new Error(
          "Demo email already exists without this manifest; refusing to adopt or overwrite it",
        );
      const [user] = await User.create(
        [{ ...account, password: accountPassword }],
        { session },
      ); // Existing bcrypt save hook.
      const [store] = await Store.create(
        [{ createdBy: user._id, shopType, name: user.shopName || "" }],
        { session },
      );
      const owner = {
        ...account,
        userId: user._id,
        productIds: [],
        supplierIds: [],
        saleIds: [],
        stockIds: [],
      };
      const suppliers = await Supplier.insertMany(
        [1, 2, 3].map((number) => ({
          name: `[DEMO] ${shopType} Supplier ${number}`,
          company: `Demo supplier ${number}`,
          email: `demo-supplier-${number}@example.invalid`,
          address: "Demo address - sample only",
          shopType,
          createdBy: user._id,
          store: store._id,
        })),
        { session },
      );
      owner.supplierIds = suppliers.map((supplier) => supplier._id);
      const saleDocuments = [],
        stockDocuments = [];
      for (const entry of buildStore(shopType, now)) {
        const { sales, pattern, supplierIndex, openingDate, ...fields } = entry;
        const [product] = await Product.create(
          [
            {
              ...fields,
              supplier: suppliers[supplierIndex]._id,
              createdBy: user._id,
              store: store._id,
            },
          ],
          { session },
        );
        owner.productIds.push(product._id);
        stockDocuments.push({
          product: product._id,
          createdBy: user._id,
          store: store._id,
          type: "STOCK_IN",
          quantity:
            product.quantity +
            sales.reduce((sum, sale) => sum + sale.quantity, 0),
          reason: "DEMO: Opening inventory (synthetic history)",
          date: openingDate,
        });
        for (const sale of sales) {
          const _id = new mongoose.Types.ObjectId();
          saleDocuments.push({
            _id,
            ...sale,
            product: product._id,
            sellingPrice: product.sellingPrice,
            totalAmount: Number(
              (sale.quantity * product.sellingPrice).toFixed(2),
            ),
            createdBy: user._id,
            store: store._id,
          });
          stockDocuments.push({
            ...sale,
            product: product._id,
            createdBy: user._id,
            store: store._id,
            type: "STOCK_OUT",
            reason: `Sale ${_id}`,
          });
        }
      }
      const savedSales = await Sale.insertMany(saleDocuments, { session });
      const savedStock = await Stock.insertMany(stockDocuments, { session });
      owner.saleIds = savedSales.map((sale) => sale._id);
      owner.stockIds = savedStock.map((stock) => stock._id);
      claim.owners.push(owner);
    }
    await claim.save({ session });
    inserted = true;
    return claim.toObject();
  });
  await prepareAlerts(manifest, now, generate);
  return { inserted, dataset: manifest, stores: await summary(manifest) };
}
async function cleanupDemo(namespace = DEFAULT_NAMESPACE) {
  requireDevelopment();
  const key = datasetKey(namespace);
  await assertDatasetUnmigrated(key);
  return mongoose.connection.transaction(async (session) => {
    const manifest = await Dataset.findById(key).session(session).lean();
    if (!manifest) return { removed: false };
    validateManifest(manifest, namespace);
    await verifyOwnership(manifest, session, true);
    for (const owner of manifest.owners) {
      for (const [Model, field] of ownedModels)
        await Model.deleteMany(
          { _id: { $in: owner[field] }, createdBy: owner.userId },
          { session },
        );
      // These are derived alerts for verified seed-owned products, never unrelated alerts.
      await Alert.deleteMany(
        { createdBy: owner.userId, product: { $in: owner.productIds } },
        { session },
      );
      await Store.deleteMany({ createdBy: owner.userId }, { session });
      await User.deleteOne(
        {
          _id: owner.userId,
          email: owner.email,
          name: owner.name,
          shopType: owner.shopType,
        },
        { session },
      );
    }
    await Dataset.deleteOne({ _id: key, kind: "SIM_P2_DEMO" }, { session });
    return { removed: true, stores: manifest.owners.length };
  });
}
module.exports = {
  seedDemo,
  cleanupDemo,
  identity,
  datasetKey,
  validateManifest,
  verifyOwnership,
  requireDevelopment,
};
