const mongoose = require("mongoose");
const { validateManifest, requireDevelopment } = require("../demo/seed");
const { readBackup, hash } = require("./backup");
const EMAIL = "yaramattiyashu13@gmail.com";
const DATASET = "sim-p2-demo-v1:presentation";
const TABLES = {
  products: "productIds",
  suppliers: "supplierIds",
  sales: "saleIds",
  stocktransactions: "stockIds",
  expiryalerts: null,
};
const keyFor = (id) => `presentation-grocery-to:${id}`;
const same = (left, right) => String(left) === String(right);
function cleanFields(collection, doc) {
  if (collection === "products")
    return {
      name: doc.name.replace(/^\[DEMO\]\s*/, ""),
      sku: doc.sku.replace(/^DEMO-/, ""),
      description:
        /^DEMO only\. Sales pattern: \w+\. Synthetic history for the existing application calculations\.$/.test(
          doc.description,
        )
          ? ""
          : doc.description,
    };
  if (collection === "suppliers")
    return {
      name: doc.name.replace(/^\[DEMO\]\s*GROCERY/, "Grocery"),
      company: /^Demo supplier \d+$/.test(doc.company) ? "" : doc.company,
      email: /^demo-supplier-\d+@example\.invalid$/.test(doc.email)
        ? ""
        : doc.email,
      address: doc.address === "Demo address - sample only" ? "" : doc.address,
    };
  if (
    collection === "stocktransactions" &&
    doc.reason === "DEMO: Opening inventory (synthetic history)"
  )
    return { reason: "Opening inventory" };
  return {};
}
async function plan(db, targetId, session) {
  requireDevelopment();
  if (!mongoose.isValidObjectId(targetId))
    throw new Error("A verified target ObjectId is required");
  const id = new mongoose.Types.ObjectId(targetId),
    options = { session };
  const target = await db
    .collection("users")
    .findOne({ _id: id, email: EMAIL }, options);
  if (!target || target.shopType !== "GROCERY")
    throw new Error("Verified target account is missing or not Grocery");
  const audit = await db
    .collection("inventorymigrations")
    .findOne({ _id: keyFor(id) }, options);
  if (audit) return { audit, target };
  if (
    await db
      .collection("inventorymigrations")
      .findOne({ datasetKey: DATASET, state: "APPLIED" }, options)
  )
    throw new Error(
      "Presentation dataset already transferred to another account",
    );
  const manifest = await db
    .collection("demodatasets")
    .findOne({ _id: DATASET }, options);
  validateManifest(manifest, "presentation");
  const owner = manifest.owners.find((row) => row.shopType === "GROCERY");
  const source = await db
    .collection("users")
    .findOne(
      {
        _id: owner.userId,
        email: owner.email,
        name: owner.name,
        shopType: "GROCERY",
      },
      options,
    );
  if (!source || same(source._id, id))
    throw new Error(
      "Source identity is not the dedicated presentation Grocery retailer",
    );
  const targetStore = await db
    .collection("stores")
    .findOne({ createdBy: id, shopType: "GROCERY" }, options);
  const sourceStore = await db
    .collection("stores")
    .findOne({ createdBy: source._id, shopType: "GROCERY" }, options);
  const records = {};
  for (const [name, field] of Object.entries(TABLES)) {
    records[name] = await db
      .collection(name)
      .find({ createdBy: source._id }, options)
      .sort({ _id: 1 })
      .toArray();
    if (
      records[name].some(
        (doc) =>
          doc.store &&
          (!targetStore || !sourceStore || !same(doc.store, sourceStore._id)),
      )
    )
      throw new Error("Scoped source/target stores are invalid");
    if (
      field &&
      (records[name].length !== owner[field].length ||
        records[name].some(
          (doc) => !owner[field].some((value) => same(value, doc._id)),
        ))
    )
      throw new Error(
        "Source has missing or untracked inventory; transfer refused",
      );
  }
  const products = new Set(owner.productIds.map(String)),
    suppliers = new Set(owner.supplierIds.map(String));
  for (const doc of records.products)
    if (
      doc.shopType !== "GROCERY" ||
      doc.fashionType != null ||
      (doc.supplier && !suppliers.has(String(doc.supplier)))
    )
      throw new Error("Product store/supplier relationship is invalid");
  if (records.suppliers.some((doc) => doc.shopType !== "GROCERY"))
    throw new Error("Supplier store mismatch");
  for (const name of ["sales", "stocktransactions", "expiryalerts"]) {
    if (
      records[name].some(
        (doc) =>
          !products.has(String(doc.product)) ||
          (doc.shopType && doc.shopType !== "GROCERY"),
      )
    )
      throw new Error("Source product relationship is invalid");
    if (
      await db
        .collection(name)
        .countDocuments(
          {
            product: { $in: owner.productIds },
            createdBy: { $ne: source._id },
          },
          options,
        )
    )
      throw new Error("Foreign product references prevent transfer");
  }
  if (
    await db
      .collection("products")
      .countDocuments(
        {
          supplier: { $in: owner.supplierIds },
          createdBy: { $ne: source._id },
        },
        options,
      )
  )
    throw new Error("Foreign supplier references prevent transfer");
  const skus = records.products.map((doc) => cleanFields("products", doc).sku);
  if (
    new Set(skus).size !== skus.length ||
    (await db
      .collection("products")
      .countDocuments({ createdBy: id, sku: { $in: skus } }, options))
  )
    throw new Error(
      "Replacement SKU collision; no products merged or overwritten",
    );
  const names = records.suppliers.map(
    (doc) => cleanFields("suppliers", doc).name,
  );
  if (
    await db
      .collection("suppliers")
      .countDocuments({ createdBy: id, name: { $in: names } }, options)
  )
    throw new Error("Supplier name collision; manual review required");
  for (const product of records.products) {
    const moves = records.stocktransactions.filter((doc) =>
      same(doc.product, product._id),
    );
    if (
      moves.reduce(
        (sum, row) =>
          sum + (row.type === "STOCK_IN" ? row.quantity : -row.quantity),
        0,
      ) !== product.quantity
    )
      throw new Error("Source stock does not balance");
    const sales = records.sales.filter((doc) => same(doc.product, product._id));
    if (
      sales.reduce((sum, row) => sum + row.quantity, 0) !==
      moves
        .filter((row) => row.type === "STOCK_OUT" && /^Sale /.test(row.reason))
        .reduce((sum, row) => sum + row.quantity, 0)
    )
      throw new Error("Sale movement quantities do not match");
    for (const sale of sales)
      if (
        sale.totalAmount !==
          Number((sale.quantity * sale.sellingPrice).toFixed(2)) ||
        !moves.some(
          (move) =>
            move.reason === `Sale ${sale._id}` &&
            move.quantity === sale.quantity &&
            +move.date === +sale.date,
        )
      )
        throw new Error("Sale amount or movement relationship is invalid");
  }
  if (
    records.expiryalerts.some(
      (row) =>
        row.recommendationStatus === "GENERATING" ||
        row.claim ||
        row.leaseUntil,
    )
  )
    throw new Error(
      "An expiry worker claim is active; stop workers and wait for recovery",
    );
  if (
    records.expiryalerts.some((row) =>
      /\bDEMO\b|\bSAMPLE DATA\b/i.test(JSON.stringify(row.recommendation)),
    )
  )
    throw new Error(
      "Stored recommendation contains presentation text; review without fabricating provider output",
    );
  const targetCounts = {};
  for (const name of Object.keys(TABLES))
    targetCounts[name] = await db
      .collection(name)
      .countDocuments({ createdBy: id }, options);
  return {
    target,
    source,
    targetStore,
    sourceStore,
    manifest,
    owner,
    records,
    targetCounts,
  };
}
function summary(p) {
  if (p.audit)
    return {
      applied: p.audit.state === "APPLIED",
      state: p.audit.state,
      targetId: String(p.target._id),
      counts: p.audit.counts,
    };
  return {
    targetId: String(p.target._id),
    sourceId: String(p.source._id),
    sourceEmail: p.source.email,
    dataset: DATASET,
    storeType: "GROCERY",
    counts: Object.fromEntries(
      Object.entries(p.records).map(([name, docs]) => [name, docs.length]),
    ),
    targetCounts: p.targetCounts,
    copies: 0,
    accountsRetained: true,
  };
}
async function apply(client, targetId, backupFile, backupHash) {
  requireDevelopment();
  const { data, sha256 } = readBackup(backupFile),
    db = client.db();
  if (sha256 !== backupHash || data.database !== db.databaseName)
    throw new Error("Verified backup checksum/database does not match");
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(
      async () => {
        const p = await plan(db, targetId, session);
        if (p.audit) {
          if (p.audit.state !== "APPLIED")
            throw new Error(
              "This migration was rolled back; no automatic reapplication",
            );
          for (const collection of Object.keys(TABLES)) {
            const ids = p.audit.records
              .filter((entry) => entry.collection === collection)
              .map((entry) => entry.id);
            const docs = await db
              .collection(collection)
              .find({ _id: { $in: ids }, createdBy: p.target._id }, { session })
              .toArray();
            if (docs.length !== ids.length)
              throw new Error(
                "Migrated records changed ownership or were removed; no automatic reset",
              );
          }
          result = { ...summary(p), repeated: true };
          return;
        }
        const original = (collection, id) =>
          data.collections
            .find((row) => row.name === collection)
            ?.documents.find((doc) => same(doc._id, id));
        for (const doc of [p.target, p.source])
          if (
            !original("users", doc._id) ||
            hash(original("users", doc._id)) !== hash(doc)
          )
            throw new Error(
              "Account changed since backup; new backup required",
            );
        if (hash(original("demodatasets", DATASET)) !== hash(p.manifest))
          throw new Error("Source manifest changed since backup");
        const auditRecords = [];
        for (const [collection, documents] of Object.entries(p.records)) {
          const operations = [];
          for (const doc of documents) {
            if (
              !original(collection, doc._id) ||
              hash(original(collection, doc._id)) !== hash(doc)
            )
              throw new Error(
                "Source records changed since backup; transfer refused",
              );
            const changes = {
              ...cleanFields(collection, doc),
              createdBy: p.target._id,
              ...(doc.store ? { store: p.targetStore._id } : {}),
            };
            const after = { ...doc, ...changes };
            operations.push({
              updateOne: {
                filter: { _id: doc._id, createdBy: p.source._id },
                update: { $set: changes },
              },
            });
            auditRecords.push({
              collection,
              id: doc._id,
              beforeHash: hash(doc),
              afterHash: hash(after),
            });
          }
          if (
            operations.length &&
            (await db.collection(collection).bulkWrite(operations, { session }))
              .matchedCount !== operations.length
          )
            throw new Error("Ownership changed during transfer");
        }
        result = { ...summary(p), applied: true, repeated: false };
        await db
          .collection("inventorymigrations")
          .insertOne(
            {
              _id: keyFor(p.target._id),
              datasetKey: DATASET,
              state: "APPLIED",
              sourceId: p.source._id,
              targetId: p.target._id,
              storeType: "GROCERY",
              appliedAt: new Date(),
              counts: result.counts,
              backupFile,
              backupHash: sha256,
              records: auditRecords,
            },
            { session },
          );
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
  return result;
}
async function rollback(client, targetId, backupFile, backupHash) {
  requireDevelopment();
  const { data, sha256 } = readBackup(backupFile),
    db = client.db();
  if (data.database !== db.databaseName || sha256 !== backupHash)
    throw new Error("Rollback backup does not match this database");
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(
      async () => {
        const audit = await db
          .collection("inventorymigrations")
          .findOne({ _id: keyFor(targetId) }, { session });
        if (!audit || audit.backupHash !== sha256 || audit.state !== "APPLIED")
          throw new Error("No applied migration matches this backup");
        const original = (name, id) =>
          data.collections
            .find((row) => row.name === name)
            ?.documents.find((doc) => same(doc._id, id));
        const productIds = audit.records
          .filter((row) => row.collection === "products")
          .map((row) => row.id);
        const supplierIds = audit.records
          .filter((row) => row.collection === "suppliers")
          .map((row) => row.id);
        for (const collection of [
          "sales",
          "stocktransactions",
          "expiryalerts",
          "products",
        ]) {
          const ids = audit.records
            .filter((row) => row.collection === collection)
            .map((row) => row.id);
          const linked =
            collection === "products"
              ? { supplier: { $in: supplierIds } }
              : { product: { $in: productIds } };
          if (
            await db
              .collection(collection)
              .countDocuments({ ...linked, _id: { $nin: ids } }, { session })
          )
            throw new Error(
              "New dependencies prevent rollback; reconcile manually",
            );
        }
        for (const id of [audit.targetId, audit.sourceId]) {
          const user = await db
            .collection("users")
            .findOne({ _id: id }, { session });
          if (!user || hash(user) !== hash(original("users", id)))
            throw new Error("Account changed since backup; rollback refused");
        }
        const operations = {};
        for (const collection of Object.keys(TABLES)) {
          const entries = audit.records.filter(
            (entry) => entry.collection === collection,
          );
          const docs = await db
            .collection(collection)
            .find(
              { _id: { $in: entries.map((entry) => entry.id) } },
              { session },
            )
            .toArray();
          operations[collection] = [];
          for (const entry of entries) {
            const doc = docs.find((item) => same(item._id, entry.id)),
              before = original(collection, entry.id);
            if (
              !doc ||
              hash(doc) !== entry.afterHash ||
              !before ||
              hash(before) !== entry.beforeHash
            )
              throw new Error(
                "Migrated data has changed; rollback refuses to discard edits",
              );
            operations[collection].push({
              replaceOne: {
                filter: { _id: entry.id, createdBy: audit.targetId },
                replacement: before,
              },
            });
          }
        }
        for (const [collection, writes] of Object.entries(operations))
          if (
            writes.length &&
            (await db.collection(collection).bulkWrite(writes, { session }))
              .matchedCount !== writes.length
          )
            throw new Error("Rollback ownership conflict");
        await db
          .collection("inventorymigrations")
          .updateOne(
            { _id: audit._id, state: "APPLIED" },
            { $set: { state: "ROLLED_BACK", rolledBackAt: new Date() } },
            { session },
          );
        result = {
          rolledBack: true,
          counts: audit.counts,
          targetId: String(audit.targetId),
        };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
  return result;
}
module.exports = {
  plan,
  summary,
  apply,
  rollback,
  cleanFields,
  EMAIL,
  DATASET,
};
