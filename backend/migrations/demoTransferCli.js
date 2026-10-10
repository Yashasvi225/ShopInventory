const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});
const transfer = require("./demoTransfer");
const { localPath, verifyRestore } = require("./backup");
async function main() {
  const [command, ...args] = process.argv.slice(2),
    options = {};
  if (!["plan", "apply", "verify", "retire", "rollback"].includes(command))
    throw new Error("Use plan, apply, verify, retire or rollback");
  for (const arg of args) {
    const match = /^--(target-id|backup|backup-hash)=(.+)$/.exec(arg);
    if (!match || options[match[1]])
      throw new Error("Invalid migration argument");
    options[match[1]] = match[2];
  }
  if (!mongoose.isValidObjectId(options["target-id"]))
    throw new Error("Verified target ID required");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  try {
    const client = mongoose.connection.getClient(),
      db = client.db();
    let result;
    if (command === "plan")
      result = transfer.summary(await transfer.plan(db, options["target-id"]));
    else if (command === "verify") {
      const audit = await db
        .collection("inventorymigrations")
        .findOne({ _id: transfer.keyFor(options["target-id"]) });
      if (!audit) throw new Error("Applied audit missing");
      result = await transfer.verify(db, audit);
    } else {
      if (
        !options.backup ||
        !/^[a-f0-9]{64}$/.test(options["backup-hash"] || "")
      )
        throw new Error("Backup path/digest required");
      await verifyRestore(client, options.backup);
      result = await transfer[command](
        client,
        options["target-id"],
        localPath(options.backup),
        options["backup-hash"],
      );
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((e) => {
  console.error(
    e.name === "Error" &&
      !e.code &&
      !/password|token|mongodb|uri/i.test(e.message)
      ? `Migration stopped: ${e.message}`
      : "Migration stopped: database/backup operation failed; credentials withheld.",
  );
  process.exitCode = 1;
});
