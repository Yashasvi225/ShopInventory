const { ObjectId } = require("mongoose").mongo;
const { SHOP_TYPES } = require("../domain/storeTypes");
const { readBackup, hash } = require("./backup");
const KEY = "owned-stores-v1";
const TABLES = [
  "products",
  "suppliers",
  "sales",
  "stocktransactions",
  "expiryalerts",
];
const same = (a, b) => String(a) === String(b);
async function plan(client, session) {
  const db = client.db(),
    options = { session };
  const audit = await db
    .collection("storemigrations")
    .findOne({ _id: KEY }, options);
  if (audit) return { audit };
  const users = await db
    .collection("users")
    .find({}, options)
    .sort({ _id: 1 })
    .toArray();
  const stores = await db.collection("stores").find({}, options).toArray();
  const records = {};
  for (const name of TABLES)
    records[name] = await db
      .collection(name)
      .find({}, options)
      .sort({ _id: 1 })
      .toArray();
  const accounts = new Map(users.map((user) => [String(user._id), user]));
  const products = new Map(
    records.products.map((product) => [String(product._id), product]),
  );
  const suppliers = new Map(
    records.suppliers.map((supplier) => [String(supplier._id), supplier]),
  );
  const configured = new Map();
  for (const user of users) {
    if (user.shopType === null || user.shopType === undefined) {
      if (
        TABLES.some((name) =>
          records[name].some((doc) => same(doc.createdBy, user._id)),
        )
      )
        throw new Error(
          "Unconfigured account has records; manual review required",
        );
      continue;
    }
    if (!SHOP_TYPES.includes(user.shopType))
      throw new Error("Unsupported legacy store type");
    const owned = stores.filter((store) => same(store.createdBy, user._id));
    if (owned.length > 1 || (owned[0] && owned[0].shopType !== user.shopType))
      throw new Error("Unexpected configured stores before backfill");
    configured.set(
      String(user._id),
      owned[0] || {
        _id: new ObjectId(),
        createdBy: user._id,
        shopType: user.shopType,
        name: user.shopName || "",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
  }
  for (const store of stores)
    if (!accounts.has(String(store.createdBy)))
      throw new Error("Orphan store; manual review required");
  const deletedProductHistory = { sales: 0, stocktransactions: 0 };
  for (const name of TABLES)
    for (const doc of records[name]) {
      const user = accounts.get(String(doc.createdBy)),
        store = configured.get(String(doc.createdBy));
      if (
        !user ||
        !store ||
        (doc.shopType && doc.shopType !== store.shopType) ||
        (doc.store && !same(doc.store, store._id))
      )
        throw new Error(
          "Legacy record store/owner mismatch; manual review required",
        );
      if (name === "products" && doc.supplier) {
        const supplier = suppliers.get(String(doc.supplier));
        if (
          !supplier ||
          !same(supplier.createdBy, doc.createdBy) ||
          supplier.shopType !== store.shopType
        )
          throw new Error("Invalid legacy supplier relationship");
      }
      if (doc.product) {
        const product = products.get(String(doc.product));
        if (
          product &&
          (!same(product.createdBy, doc.createdBy) ||
            product.shopType !== store.shopType)
        )
          throw new Error("Foreign legacy product relationship");
        // Existing product deletion deliberately retains sales/movement history.
        // Its original owner has exactly one verified type; preserve the missing link.
        if (!product) {
          if (!["sales", "stocktransactions"].includes(name))
            throw new Error("Orphan expiry alert requires review");
          deletedProductHistory[name]++;
        }
      }
      if (
        name === "expiryalerts" &&
        (doc.claim ||
          doc.leaseUntil ||
          doc.recommendationStatus === "GENERATING")
      )
        throw new Error(
          "Active expiry lease; quiesce workers before migrating",
        );
    }
  return {
    users,
    stores,
    records,
    configured: [...configured.values()],
    deletedProductHistory,
  };
}
function summary(p) {
  return p.audit
    ? { state: p.audit.state, repeated: true, counts: p.audit.counts }
    : {
        users: p.users.length,
        stores: p.configured.length,
        counts: Object.fromEntries(
          TABLES.map((name) => [name, p.records[name].length]),
        ),
        deletedProductHistory: p.deletedProductHistory,
      };
}
async function assertReady(client) {
  const db = client.db();
  for (const name of TABLES)
    if (
      await db
        .collection(name)
        .findOne({ store: null }, { projection: { _id: 1 } })
    )
      throw new Error(
        "Run the verified owned-store backfill before starting the API",
      );
  const users = await db
    .collection("users")
    .find(
      { shopType: { $in: SHOP_TYPES } },
      { projection: { _id: 1, shopType: 1 } },
    )
    .toArray();
  for (const user of users)
    if (
      !(await db
        .collection("stores")
        .findOne({ createdBy: user._id, shopType: user.shopType }))
    )
      throw new Error("Existing account store backfill is required");
}
async function verifyApplied(client) {
  await assertReady(client);
  const db = client.db();
  const stores = new Map(
    (await db.collection("stores").find({}).toArray()).map((store) => [
      String(store._id),
      store,
    ]),
  );
  const users = new Set(
    (
      await db
        .collection("users")
        .find({}, { projection: { _id: 1 } })
        .toArray()
    ).map((user) => String(user._id)),
  );
  for (const store of stores.values())
    if (
      !users.has(String(store.createdBy)) ||
      !SHOP_TYPES.includes(store.shopType)
    )
      throw new Error("Invalid store owner/type");
  const products = new Map(
    (await db.collection("products").find({}).toArray()).map((product) => [
      String(product._id),
      product,
    ]),
  );
  const suppliers = new Map(
    (await db.collection("suppliers").find({}).toArray()).map((supplier) => [
      String(supplier._id),
      supplier,
    ]),
  );
  for (const name of TABLES)
    for (const doc of await db.collection(name).find({}).toArray()) {
      const store = stores.get(String(doc.store));
      if (
        !store ||
        !same(store.createdBy, doc.createdBy) ||
        (doc.shopType && doc.shopType !== store.shopType)
      )
        throw new Error("Invalid applied store relationship");
      const linked = doc.product
        ? products.get(String(doc.product))
        : doc.supplier
          ? suppliers.get(String(doc.supplier))
          : null;
      if (
        linked &&
        (!same(linked.store, doc.store) ||
          !same(linked.createdBy, doc.createdBy))
      )
        throw new Error("Cross-store record relationship");
      if (
        ((name === "expiryalerts" && doc.product) ||
          (name === "products" && doc.supplier)) &&
        !linked
      )
        throw new Error("Missing linked store record");
    }
}
async function apply(client, file, digest) {
  const db = client.db(),
    saved = readBackup(file);
  if (saved.sha256 !== digest || saved.data.database !== db.databaseName)
    throw new Error("Backup identity/checksum mismatch");
  await db
    .collection("stores")
    .createIndex({ createdBy: 1, shopType: 1 }, { unique: true });
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(
      async () => {
        const p = await plan(client, session);
        if (p.audit) {
          if (p.audit.state !== "APPLIED")
            throw new Error(
              "Backfill was rolled back; automatic reapply refused",
            );
          await verifyApplied(client);
          result = summary(p);
          return;
        }
        // Compare every original document, including Users and prior migration manifests.
        for (const collection of saved.data.collections) {
          const actual = await db
            .collection(collection.name)
            .find({}, { session })
            .sort({ _id: 1 })
            .toArray();
          if (
            actual.length !== collection.documents.length ||
            actual.some((doc, i) => hash(doc) !== hash(collection.documents[i]))
          )
            throw new Error(
              "Database changed after backup; make a fresh verified backup",
            );
        }
        const stores = p.configured.filter(
          (store) => !p.stores.some((old) => same(old._id, store._id)),
        );
        if (stores.length)
          await db.collection("stores").insertMany(stores, { session });
        const byOwner = new Map(
          p.configured.map((store) => [String(store.createdBy), store]),
        );
        const entries = [];
        for (const name of TABLES) {
          const operations = p.records[name]
            .filter((doc) => !doc.store)
            .map((doc) => {
              const store = byOwner.get(String(doc.createdBy))._id;
              entries.push({
                name,
                id: doc._id,
                beforeHash: hash(doc),
                afterHash: hash({ ...doc, store }),
                store,
              });
              return {
                updateOne: {
                  filter: {
                    _id: doc._id,
                    createdBy: doc.createdBy,
                    store: { $exists: false },
                  },
                  update: { $set: { store } },
                },
              };
            });
          if (operations.length) {
            const written = await db
              .collection(name)
              .bulkWrite(operations, { session });
            if (written.modifiedCount !== operations.length)
              throw new Error("Concurrent record change; migration aborted");
          }
        }
        const counts = Object.fromEntries(
          TABLES.map((name) => [name, p.records[name].length]),
        );
        await db
          .collection("storemigrations")
          .insertOne(
            {
              _id: KEY,
              state: "APPLIED",
              appliedAt: new Date(),
              backup: file,
              sha256: digest,
              entries,
              stores,
              counts,
              userHashes: p.users.map((user) => ({
                id: user._id,
                hash: hash(user),
              })),
            },
            { session },
          );
        result = {
          state: "APPLIED",
          users: p.users.length,
          stores: stores.length,
          counts,
          deletedProductHistory: p.deletedProductHistory,
        };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
    return result;
  } finally {
    await session.endSession();
  }
}
async function rollback(client, file, digest) {
  const db = client.db(),
    saved = readBackup(file);
  if (saved.sha256 !== digest || saved.data.database !== db.databaseName)
    throw new Error("Wrong rollback backup");
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const audit = await db
        .collection("storemigrations")
        .findOne({ _id: KEY }, { session });
      if (!audit || audit.state !== "APPLIED" || audit.sha256 !== digest)
        throw new Error("Applied audit/backup mismatch");
      const originalStores =
        saved.data.collections.find(
          (collection) => collection.name === "stores",
        )?.documents || [];
      const allowedStores = [...originalStores, ...audit.stores].map(
        (store) => store._id,
      );
      if (
        await db
          .collection("stores")
          .findOne({ _id: { $nin: allowedStores } }, { session })
      )
        throw new Error(
          "New stores depend on the multi-store architecture; rollback refused",
        );
      for (const item of audit.userHashes)
        if (
          hash(
            await db.collection("users").findOne({ _id: item.id }, { session }),
          ) !== item.hash
        )
          throw new Error("Account changed after backfill; rollback refused");
      for (const name of TABLES) {
        const entries = audit.entries.filter((entry) => entry.name === name),
          actual = await db
            .collection(name)
            .find(
              { store: { $in: audit.stores.map((store) => store._id) } },
              { session },
            )
            .toArray();
        if (actual.length !== entries.length)
          throw new Error(
            "New records depend on migrated stores; rollback refused",
          );
        const operations = [];
        for (const entry of entries) {
          const current = actual.find((doc) => same(doc._id, entry.id));
          if (!current || hash(current) !== entry.afterHash)
            throw new Error("Migrated record changed; rollback refused");
          const before = saved.data.collections
            .find((collection) => collection.name === name)
            ?.documents.find((doc) => same(doc._id, entry.id));
          if (!before || hash(before) !== entry.beforeHash)
            throw new Error("Backup record mismatch");
          operations.push({
            replaceOne: {
              filter: { _id: entry.id, store: entry.store },
              replacement: before,
            },
          });
        }
        if (operations.length)
          await db.collection(name).bulkWrite(operations, { session });
      }
      for (const store of audit.stores) {
        const current = await db
          .collection("stores")
          .findOne({ _id: store._id }, { session });
        if (!current || hash(current) !== hash(store))
          throw new Error("Store changed; rollback refused");
        await db
          .collection("stores")
          .deleteOne({ _id: store._id }, { session });
      }
      await db
        .collection("storemigrations")
        .updateOne(
          { _id: KEY },
          { $set: { state: "ROLLED_BACK", rolledBackAt: new Date() } },
          { session },
        );
      result = { state: "ROLLED_BACK", counts: audit.counts };
    });
    return result;
  } finally {
    await session.endSession();
  }
}
module.exports = { plan, summary, apply, rollback, assertReady, verifyApplied };
