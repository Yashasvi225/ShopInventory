const path = require("node:path");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});
const { requireDevelopment } = require("../demo/seed");
const { createBackup, verifyRestore, localPath } = require("./backup");
const { plan, summary, apply, rollback } = require("./grocery");
async function main() {
  requireDevelopment();
  const [command, ...args] = process.argv.slice(2),
    options = {};
  if (
    !["plan", "backup", "verify-backup", "apply", "rollback"].includes(command)
  )
    throw new Error("Use plan, backup, verify-backup, apply or rollback");
  for (const item of args) {
    const match = /^--(target-id|backup|backup-hash)=(.+)$/.exec(item);
    if (!match || options[match[1]])
      throw new Error("Unrecognized or duplicated migration argument");
    options[match[1]] = match[2];
  }
  if (!process.env.MONGO_URI) throw new Error("Configure backend/.env first");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
  });
  const client = mongoose.connection.getClient();
  try {
    let result;
    if (command === "backup") {
      const file = localPath(
        options.backup ||
          path.join(
            __dirname,
            "../backups",
            `inventory-${randomUUID()}.dpapi.json`,
          ),
      );
      result = await createBackup(client, file);
      result = { ...result, ...(await verifyRestore(client, file)) };
    } else if (command === "verify-backup")
      result = await verifyRestore(client, options.backup);
    else if (command === "plan")
      result = summary(await plan(client.db(), options["target-id"]));
    else {
      if (
        !mongoose.isValidObjectId(options["target-id"]) ||
        !options.backup ||
        !/^[a-f0-9]{64}$/.test(options["backup-hash"] || "")
      )
        throw new Error(
          "Verified target ID, backup path and backup checksum are required",
        );
      await verifyRestore(client, options.backup);
      result = await (command === "apply" ? apply : rollback)(
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
main().catch((error) => {
  const fixed =
    error.name === "Error" &&
    !error.code &&
    !/mongodb|password|token|uri/i.test(error.message);
  console.error(
    fixed
      ? `Migration stopped: ${error.message}`
      : "Migration stopped: database/backup operation failed; no credentials disclosed.",
  );
  process.exitCode = 1;
});
