const mongoose = require("mongoose");
const { validateManifest, requireDevelopment } = require("../demo/seed");
const { readBackup, hash } = require("./backup");
const { salesBasis, basisExplanation } = require("../domain/expiryAlerts");
const EMAIL = "noushik@gmail.com";
const TABLES = {
  suppliers: "supplierIds",
  products: "productIds",
  sales: "saleIds",
  stocktransactions: "stockIds",
  expiryalerts: null,
};
const DATASETS = ["sim-p2-demo-v1:local", "sim-p2-demo-v1:presentation"];
const same = (a, b) => String(a) === String(b);
const keyFor = (id) => `demo-consolidation-to:${id}`;
function clean(collection, doc) {
  if (collection === "products") {
    const match =
      /^DEMO only\. Sales pattern: \w+\. (Variant: .*?\. )?Synthetic history for the existing application calculations\.$/.exec(
        doc.description,
      );
    return {
      name: doc.name.replace(/^\[DEMO\]\s*/, ""),
      sku: doc.sku.replace(/^DEMO-/, ""),
      description: match ? (match[1] || "").trim() : doc.description,
    };
  }
  if (collection === "suppliers")
    return {
      name: doc.name
        .replace(/^\[DEMO\]\s*/, "")
        .replace(
          /^(MEDICAL|RESTAURANT|GROCERY|CLOTHING)\b/,
          (value) => value[0] + value.slice(1).toLowerCase(),
        ),
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
function comparable(doc, product = false) {
  const { _id, createdBy, store, createdAt, updatedAt, ...fields } = doc;
  if (product) delete fields.quantity;
  return fields;
}
async function plan(db, targetId, session) {
  requireDevelopment();
  if (!mongoose.isValidObjectId(targetId))
    throw new Error("Verified target ID is required");
  const id = new mongoose.Types.ObjectId(targetId),
    options = { session };
  const target = await db
    .collection("users")
    .findOne({ _id: id, email: EMAIL }, options);
  if (!target)
    throw new Error(
      "Existing target account not found; no account will be created",
    );
  const audit = await db
    .collection("inventorymigrations")
    .findOne({ _id: keyFor(id) }, options);
  if (audit) return { target, audit };
  const stores = await db
    .collection("stores")
    .find({ createdBy: id }, options)
    .toArray();
  const targetCounts = {};
  for (const name of Object.keys(TABLES))
    targetCounts[name] = await db
      .collection(name)
      .countDocuments({ createdBy: id }, options);
  const sources = [],
    records = Object.fromEntries(Object.keys(TABLES).map((n) => [n, []])),
    manifests = [],
    skipped = [];
  for (const datasetKey of DATASETS) {
    const manifest = await db
      .collection("demodatasets")
      .findOne({ _id: datasetKey }, options);
    if (!manifest) continue;
    validateManifest(manifest, manifest.namespace);
    manifests.push(manifest);
    for (const owner of manifest.owners) {
      const user = await db
        .collection("users")
        .findOne(
          {
            _id: owner.userId,
            email: owner.email,
            name: owner.name,
            shopType: owner.shopType,
          },
          options,
        );
      if (!user || same(user._id, id))
        throw new Error("Dedicated source account identity changed");
      const ownedStores = await db
        .collection("stores")
        .find({ createdBy: owner.userId }, options)
        .toArray();
      if (
        ownedStores.length !== 1 ||
        ownedStores[0].shopType !== owner.shopType
      )
        throw new Error("Dedicated source store membership changed");
      const store = ownedStores[0],
        destination = stores.filter((s) => s.shopType === owner.shopType);
      if (destination.length !== 1)
        throw new Error("Target must already own the matching store type");
      const rows = {};
      for (const [name, field] of Object.entries(TABLES)) {
        rows[name] = await db
          .collection(name)
          .find({ createdBy: user._id }, options)
          .sort({ _id: 1 })
          .toArray();
        if (
          rows[name].some(
            (d) =>
              !same(d.store, store._id) ||
              (d.shopType && d.shopType !== owner.shopType),
          )
        )
          throw new Error("Source store scope changed");
        if (
          field &&
          rows[name].length &&
          (rows[name].length !== owner[field].length ||
            rows[name].some((d) => !owner[field].some((i) => same(i, d._id))))
        )
          throw new Error(
            "Missing or untracked source records; transfer refused",
          );
      }
      if (!rows.products.length) {
        const prior = await db
          .collection("inventorymigrations")
          .findOne(
            { datasetKey, sourceId: user._id, state: "APPLIED" },
            options,
          );
        if (!prior || Object.values(rows).some((r) => r.length))
          throw new Error(
            "Source is empty without a verified previous transfer",
          );
        for (const [name, field] of Object.entries(TABLES))
          if (field) {
            const moved = await db
              .collection(name)
              .countDocuments(
                { _id: { $in: owner[field] }, createdBy: prior.targetId },
                options,
              );
            if (moved !== owner[field].length)
              throw new Error(
                "Previously transferred real-account records changed; review required",
              );
          }
        skipped.push({
          userId: user._id,
          email: owner.email,
          reason:
            "Already transferred to another real account; retained for its recovery audit",
        });
        continue;
      }
      for (const [name, field] of Object.entries(TABLES))
        if (field && rows[name].length !== owner[field].length)
          throw new Error("Missing source records");
      const products = new Set(owner.productIds.map(String)),
        suppliers = new Set(owner.supplierIds.map(String));
      for (const product of rows.products) {
        if (product.supplier && !suppliers.has(String(product.supplier)))
          throw new Error("Invalid source supplier link");
        if (
          owner.shopType === "CLOTHING"
            ? product.expiryDate != null ||
              !["OLD_FASHION", "NEW_FASHION"].includes(product.fashionType)
            : product.fashionType != null
        )
          throw new Error("Invalid store-specific product attributes");
        const moves = rows.stocktransactions.filter((r) =>
          same(r.product, product._id),
        );
        if (
          moves.reduce(
            (s, r) => s + (r.type === "STOCK_IN" ? r.quantity : -r.quantity),
            0,
          ) !== product.quantity
        )
          throw new Error("Source stock does not balance");
        const sales = rows.sales.filter((r) => same(r.product, product._id));
        if (
          sales.reduce((s, r) => s + r.quantity, 0) !==
          moves
            .filter((r) => r.type === "STOCK_OUT" && /^Sale /.test(r.reason))
            .reduce((s, r) => s + r.quantity, 0)
        )
          throw new Error("Sale deductions do not balance");
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
            throw new Error("Invalid sale/movement relationship");
      }
      for (const name of ["sales", "stocktransactions", "expiryalerts"]) {
        if (rows[name].some((r) => !products.has(String(r.product))))
          throw new Error("Invalid source product link");
        if (
          await db
            .collection(name)
            .countDocuments(
              {
                product: { $in: owner.productIds },
                createdBy: { $ne: user._id },
              },
              options,
            )
        )
          throw new Error("Foreign references prevent migration");
      }
      if (
        await db
          .collection("products")
          .countDocuments(
            {
              supplier: { $in: owner.supplierIds },
              createdBy: { $ne: user._id },
            },
            options,
          )
      )
        throw new Error("Foreign supplier references prevent migration");
      if (
        rows.expiryalerts.some(
          (r) =>
            owner.shopType === "CLOTHING" ||
            r.recommendationStatus === "GENERATING" ||
            r.claim ||
            r.leaseUntil,
        )
      )
        throw new Error(
          "Clothing alert or active worker claim; transfer refused",
        );
      sources.push({ datasetKey, user, store, destination });
      for (const name of Object.keys(TABLES)) records[name].push(...rows[name]);
    }
  }
  if (!sources.length)
    throw new Error("No verified remaining demo inventory was found");
  const sourceFor = (doc) =>
    sources.find((s) => same(s.user._id, doc.createdBy));
  const after = Object.fromEntries(Object.keys(TABLES).map((n) => [n, []])),
    removed = Object.fromEntries(Object.keys(TABLES).map((n) => [n, []]));
  const supplierMap = new Map(),
    productMap = new Map(),
    suppliers = new Map(),
    products = new Map();
  for (const original of records.suppliers) {
    const source = sourceFor(original),
      doc = {
        ...original,
        ...clean("suppliers", original),
        createdBy: id,
        store: source.destination[0]._id,
      };
    const key = `${doc.shopType}:${doc.name.toLowerCase()}`,
      previous = suppliers.get(key);
    if (previous && hash(comparable(previous)) !== hash(comparable(doc)))
      throw new Error("Supplier duplicate has conflicting attributes");
    const canonical = previous || doc;
    suppliers.set(key, canonical);
    supplierMap.set(String(original._id), canonical._id);
    if (previous) removed.suppliers.push(original);
    else after.suppliers.push(doc);
  }
  for (const original of records.products) {
    const source = sourceFor(original),
      doc = {
        ...original,
        ...clean("products", original),
        createdBy: id,
        store: source.destination[0]._id,
        supplier: original.supplier
          ? supplierMap.get(String(original.supplier))
          : null,
      };
    const previous = products.get(doc.sku);
    if (
      previous &&
      hash(comparable(previous, true)) !== hash(comparable(doc, true))
    )
      throw new Error(
        "Product SKU duplicate has conflicting attributes; no automatic merge",
      );
    if (previous) {
      previous.quantity += doc.quantity;
      if (!Number.isSafeInteger(previous.quantity) || previous.quantity < 0)
        throw new Error("Consolidated quantity is invalid");
      if (doc.createdAt < previous.createdAt)
        previous.createdAt = doc.createdAt;
      removed.products.push(original);
    } else {
      products.set(doc.sku, doc);
      after.products.push(doc);
    }
    productMap.set(String(original._id), (previous || doc)._id);
  }
  if (
    await db
      .collection("products")
      .countDocuments(
        { createdBy: id, sku: { $in: after.products.map((p) => p.sku) } },
        options,
      )
  )
    throw new Error(
      "Existing target SKU collision; no real records merged or overwritten",
    );
  for (const s of after.suppliers)
    if (
      await db
        .collection("suppliers")
        .findOne(
          {
            createdBy: id,
            store: s.store,
            name: {
              $regex: `^${s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
              $options: "i",
            },
          },
          options,
        )
    )
      throw new Error("Existing target supplier name collision");
  for (const name of ["sales", "stocktransactions"])
    for (const original of records[name])
      after[name].push({
        ...original,
        ...clean(name, original),
        createdBy: id,
        store: sourceFor(original).destination[0]._id,
        product: productMap.get(String(original.product)),
      });
  const alerts = new Map();
  for (const original of records.expiryalerts) {
    const doc = {
      ...original,
      createdBy: id,
      store: sourceFor(original).destination[0]._id,
      product: productMap.get(String(original.product)),
    };
    const key = `${doc.product}:${doc.expiryDay}`,
      previous = alerts.get(key);
    if (previous) {
      if (
        doc.dismissedAt &&
        (!previous.dismissedAt || doc.dismissedAt < previous.dismissedAt)
      )
        previous.dismissedAt = doc.dismissedAt;
      removed.expiryalerts.push(original);
    } else {
      alerts.set(key, doc);
      after.expiryalerts.push(doc);
    }
  }
  const mergedIds = new Set(
      removed.products.map((p) => String(productMap.get(String(p._id)))),
    ),
    now = new Date();
  for (const alert of after.expiryalerts)
    if (mergedIds.has(String(alert.product))) {
      const product = after.products.find((p) => same(p._id, alert.product));
      const basis = salesBasis(
        product,
        after.sales.filter((s) => same(s.product, product._id)),
        now,
      );
      // Recompute an actual application estimate; never reuse a Gemini response for different inputs.
      alert.recommendation = {
        salesBasis: basis,
        explanation: basisExplanation(basis),
        generatedAt: now.toISOString(),
        suggestedPurchaseQuantity: basis.suggestedPurchaseQuantity,
        source: "APPLICATION",
      };
      alert.recommendationStatus =
        basis.suggestedPurchaseQuantity == null ? "NO_DATA" : "UNAVAILABLE";
      alert.attempts = 0;
      alert.retryAt =
        basis.suggestedPurchaseQuantity == null
          ? null
          : new Date(+now + 15 * 60_000);
      alert.claim = null;
      alert.leaseUntil = null;
      alert.updatedAt = now;
    }
  return {
    target,
    stores,
    sources,
    skipped,
    manifests,
    records,
    after,
    removed,
    targetCounts,
    productMap,
    supplierMap,
  };
}
function summary(p) {
  if (p.audit)
    return {
      targetId: String(p.target._id),
      state: p.audit.state,
      repeated: true,
      counts: p.audit.counts,
    };
  return {
    targetId: String(p.target._id),
    email: EMAIL,
    sources: p.sources.map((s) => ({
      email: s.user.email,
      userId: String(s.user._id),
      shopType: s.store.shopType,
    })),
    skipped: p.skipped,
    sourceCounts: Object.fromEntries(
      Object.entries(p.records).map(([n, rows]) => [n, rows.length]),
    ),
    counts: Object.fromEntries(
      Object.entries(p.after).map(([n, rows]) => [n, rows.length]),
    ),
    consolidated: Object.fromEntries(
      Object.entries(p.removed).map(([n, rows]) => [n, rows.length]),
    ),
    targetCounts: p.targetCounts,
    copies: 0,
  };
}
async function verify(db, audit, session) {
  if (audit.state !== "APPLIED") throw new Error("Migration is not applied");
  const options = { session },
    owners = new Map(audit.stores.map((s) => [String(s._id), s.shopType]));
  const rows = {};
  for (const name of Object.keys(TABLES))
    rows[name] = await db
      .collection(name)
      .find(
        {
          _id: {
            $in: audit.records
              .filter((r) => r.collection === name)
              .map((r) => r.id),
          },
        },
        options,
      )
      .toArray();
  const docs = new Map(
    Object.entries(rows).flatMap(([name, values]) =>
      values.map((d) => [`${name}:${d._id}`, d]),
    ),
  );
  for (const record of audit.records) {
    const doc = docs.get(`${record.collection}:${record.id}`);
    if (
      record.afterHash === null
        ? !!doc
        : !doc ||
          !same(doc.createdBy, audit.targetId) ||
          !owners.has(String(doc.store))
    )
      throw new Error("Migrated record removed or changed ownership");
    if (
      doc &&
      record.collection === "products" &&
      (doc.shopType !== owners.get(String(doc.store)) ||
        (doc.shopType === "CLOTHING" &&
          (doc.expiryDate ||
            !["OLD_FASHION", "NEW_FASHION"].includes(doc.fashionType))))
    )
      throw new Error("Migrated product rules are invalid");
  }
  for (const name of ["sales", "stocktransactions", "expiryalerts"])
    for (const row of rows[name]) {
      const p = docs.get(`products:${row.product}`);
      if (
        !p ||
        !same(p.store, row.store) ||
        (name === "expiryalerts" && p.shopType === "CLOTHING")
      )
        throw new Error("Migrated history product link is invalid");
    }
  const currentMoves = await db
    .collection("stocktransactions")
    .find(
      { product: { $in: audit.productIds }, createdBy: audit.targetId },
      options,
    )
    .toArray();
  for (const p of rows.products) {
    const supplier = p.supplier && docs.get(`suppliers:${p.supplier}`);
    if (p.supplier && (!supplier || !same(supplier.store, p.store)))
      throw new Error("Migrated supplier link is invalid");
    const moves = currentMoves.filter(
      (r) => same(r.product, p._id) && same(r.store, p.store),
    );
    if (
      moves.reduce(
        (s, r) => s + (r.type === "STOCK_IN" ? r.quantity : -r.quantity),
        0,
      ) !== p.quantity
    )
      throw new Error("Migrated stock balance is invalid");
  }
  return { verified: true, counts: audit.counts };
}
async function apply(client, targetId, file, digest) {
  requireDevelopment();
  const { data, sha256 } = readBackup(file),
    db = client.db();
  if (sha256 !== digest || data.database !== db.databaseName)
    throw new Error("Backup digest/database mismatch");
  const original = (n, id) =>
    data.collections
      .find((c) => c.name === n)
      ?.documents.find((d) => same(d._id, id));
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(
      async () => {
        const p = await plan(db, targetId, session);
        if (p.audit) {
          await verify(db, p.audit, session);
          result = summary(p);
          return;
        }
        for (const [name, docs] of [
          ["users", [p.target, ...p.sources.map((s) => s.user)]],
          ["stores", [...p.stores, ...p.sources.map((s) => s.store)]],
          ["demodatasets", p.manifests],
          ...Object.entries(p.records),
        ])
          for (const doc of docs) {
            if (
              !original(name, doc._id) ||
              hash(original(name, doc._id)) !== hash(doc)
            )
              throw new Error(
                "Records changed since backup; fresh backup required",
              );
          }
        const auditRecords = [];
        // Remove exact redundant source records before destination unique indexes are evaluated.
        for (const [name, docs] of Object.entries(p.removed)) {
          if (
            docs.length &&
            (
              await db.collection(name).bulkWrite(
                docs.map((doc) => ({
                  deleteOne: {
                    filter: {
                      _id: doc._id,
                      createdBy: doc.createdBy,
                      store: doc.store,
                    },
                  },
                })),
                { session },
              )
            ).deletedCount !== docs.length
          )
            throw new Error("Source record changed");
          auditRecords.push(
            ...docs.map((doc) => ({
              collection: name,
              id: doc._id,
              beforeHash: hash(doc),
              afterHash: null,
            })),
          );
        }
        for (const [name, docs] of Object.entries(p.after)) {
          const operations = docs.map((doc) => ({
            replaceOne: {
              filter: {
                _id: doc._id,
                createdBy: original(name, doc._id).createdBy,
                store: original(name, doc._id).store,
              },
              replacement: doc,
            },
          }));
          if (
            operations.length &&
            (await db.collection(name).bulkWrite(operations, { session }))
              .matchedCount !== operations.length
          )
            throw new Error("Source ownership changed");
          auditRecords.push(
            ...docs.map((doc) => ({
              collection: name,
              id: doc._id,
              beforeHash: hash(original(name, doc._id)),
              afterHash: hash(doc),
            })),
          );
        }
        result = { ...summary(p), applied: true, repeated: false };
        const audit = {
          _id: keyFor(p.target._id),
          state: "APPLIED",
          targetId: p.target._id,
          targetHash: hash(p.target),
          datasetKeys: p.manifests.map((m) => m._id),
          stores: p.stores.map((s) => ({ _id: s._id, shopType: s.shopType })),
          sources: p.sources.map((s) => ({
            userId: s.user._id,
            storeId: s.store._id,
            email: s.user.email,
            name: s.user.name,
            shopType: s.user.shopType,
            userHash: hash(s.user),
            storeHash: hash(s.store),
          })),
          skipped: p.skipped,
          counts: result.counts,
          sourceCounts: result.sourceCounts,
          consolidated: result.consolidated,
          productIds: p.after.products.map((p) => p._id),
          supplierIds: p.after.suppliers.map((s) => s._id),
          appliedAt: new Date(),
          backupFile: file,
          backupHash: sha256,
          records: auditRecords,
          retired: false,
        };
        await db
          .collection("inventorymigrations")
          .insertOne(audit, { session });
        await verify(db, audit, session);
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
  return result;
}
async function retire(client, targetId, file, digest) {
  requireDevelopment();
  const { sha256, data } = readBackup(file),
    db = client.db();
  if (sha256 !== digest || data.database !== db.databaseName)
    throw new Error("Backup digest/database mismatch");
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(
      async () => {
        const audit = await db
          .collection("inventorymigrations")
          .findOne({ _id: keyFor(targetId), state: "APPLIED" }, { session });
        if (!audit || audit.backupHash !== sha256)
          throw new Error("Verified applied migration is required");
        await verify(db, audit, session);
        if (audit.retired) {
          result = {
            retired: true,
            repeated: true,
            accounts: audit.sources.length,
          };
          return;
        }
        for (const source of audit.sources) {
          const user = await db
              .collection("users")
              .findOne({ _id: source.userId }, { session }),
            store = await db
              .collection("stores")
              .findOne({ _id: source.storeId }, { session });
          if (
            !user ||
            !store ||
            hash(user) !== source.userHash ||
            hash(store) !== source.storeHash
          )
            throw new Error("Dedicated account changed; retirement refused");
          for (const name of Object.keys(TABLES))
            if (
              await db
                .collection(name)
                .findOne(
                  {
                    $or: [
                      { createdBy: source.userId },
                      { store: source.storeId },
                    ],
                  },
                  { session },
                )
            )
              throw new Error("Dependent records prevent retirement");
          if (
            (await db
              .collection("stores")
              .countDocuments({ createdBy: source.userId }, { session })) !== 1
          )
            throw new Error("Additional store membership prevents retirement");
          await db
            .collection("stores")
            .deleteOne(
              { _id: source.storeId, createdBy: source.userId },
              { session },
            );
          await db
            .collection("users")
            .deleteOne(
              { _id: source.userId, email: source.email },
              { session },
            );
        }
        await db
          .collection("inventorymigrations")
          .updateOne(
            { _id: audit._id },
            { $set: { retired: true, retiredAt: new Date() } },
            { session },
          );
        result = {
          retired: true,
          repeated: false,
          accounts: audit.sources.length,
          retained: audit.skipped,
        };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
  return result;
}
async function rollback(client, targetId, file, digest) {
  requireDevelopment();
  const { data, sha256 } = readBackup(file),
    db = client.db();
  if (sha256 !== digest || data.database !== db.databaseName)
    throw new Error("Backup digest/database mismatch");
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(
      async () => {
        const audit = await db
          .collection("inventorymigrations")
          .findOne({ _id: keyFor(targetId), state: "APPLIED" }, { session });
        if (!audit || audit.backupHash !== sha256)
          throw new Error("Applied migration with this backup required");
        const target = await db
          .collection("users")
          .findOne({ _id: audit.targetId }, { session });
        if (!target || hash(target) !== audit.targetHash)
          throw new Error("Target account changed; rollback refused");
        for (const name of ["sales", "stocktransactions", "expiryalerts"])
          if (
            await db
              .collection(name)
              .findOne(
                {
                  product: { $in: audit.productIds },
                  _id: {
                    $nin: audit.records
                      .filter((r) => r.collection === name)
                      .map((r) => r.id),
                  },
                },
                { session },
              )
          )
            throw new Error("New dependencies prevent rollback");
        if (
          await db
            .collection("products")
            .findOne(
              {
                supplier: { $in: audit.supplierIds },
                _id: { $nin: audit.productIds },
              },
              { session },
            )
        )
          throw new Error("New supplier dependencies prevent rollback");
        const current = new Map();
        for (const name of Object.keys(TABLES))
          for (const doc of await db
            .collection(name)
            .find(
              {
                _id: {
                  $in: audit.records
                    .filter((r) => r.collection === name)
                    .map((r) => r.id),
                },
              },
              { session },
            )
            .toArray())
            current.set(`${name}:${doc._id}`, doc);
        for (const record of audit.records) {
          const doc = current.get(`${record.collection}:${record.id}`);
          if (
            record.afterHash === null
              ? !!doc
              : !doc || hash(doc) !== record.afterHash
          )
            throw new Error("Migrated records changed; rollback refused");
        }
        const original = (n, id) =>
          data.collections
            .find((c) => c.name === n)
            ?.documents.find((d) => same(d._id, id));
        for (const source of audit.sources)
          for (const [name, id, expected] of [
            ["users", source.userId, source.userHash],
            ["stores", source.storeId, source.storeHash],
          ]) {
            const doc = await db
              .collection(name)
              .findOne({ _id: id }, { session });
            if (audit.retired ? !!doc : !doc || hash(doc) !== expected)
              throw new Error("Source account/store changed; rollback refused");
            if (audit.retired) {
              const saved = original(name, id);
              if (!saved || hash(saved) !== expected)
                throw new Error("Recovery account missing from backup");
              await db.collection(name).insertOne(saved, { session });
            }
          }
        for (const name of Object.keys(TABLES)) {
          const operations = audit.records
            .filter((r) => r.collection === name)
            .map((record) => {
              const saved = original(name, record.id);
              if (!saved || hash(saved) !== record.beforeHash)
                throw new Error("Backup record mismatch");
              return {
                replaceOne: {
                  filter: { _id: record.id },
                  replacement: saved,
                  upsert: record.afterHash === null,
                },
              };
            });
          if (operations.length)
            await db.collection(name).bulkWrite(operations, { session });
        }
        await db
          .collection("inventorymigrations")
          .updateOne(
            { _id: audit._id },
            { $set: { state: "ROLLED_BACK", rolledBackAt: new Date() } },
            { session },
          );
        result = { rolledBack: true, records: audit.records.length };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
  return result;
}
module.exports = {
  EMAIL,
  TABLES,
  keyFor,
  clean,
  comparable,
  plan,
  summary,
  verify,
  apply,
  retire,
  rollback,
};
