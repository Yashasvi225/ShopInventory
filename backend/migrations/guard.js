const mongoose = require("mongoose");
async function assertDatasetUnmigrated(key, session) {
  const found = await mongoose.connection
    .collection("inventorymigrations")
    .findOne(
      { $or: [{ datasetKey: key }, { datasetKeys: key }], state: "APPLIED" },
      { session },
    );
  if (found)
    throw new Error(
      "This presentation dataset has transferred records. Seed, reset and cleanup are refused to protect the receiving account.",
    );
}
module.exports = { assertDatasetUnmigrated };
