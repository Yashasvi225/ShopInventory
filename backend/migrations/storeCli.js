require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const { createBackup, verifyRestore, localPath } = require("./backup");
const migration = require("./stores");
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Use a planned maintenance deployment for production");
  const [command, ...args] = process.argv.slice(2),
    options = {};
  if (!["plan", "backup", "apply", "verify", "rollback"].includes(command))
    throw new Error("Use plan, backup, apply, verify or rollback");
  for (const arg of args) {
    const match = /^--(backup|backup-hash)=(.+)$/.exec(arg);
    if (!match || options[match[1]])
      throw new Error("Invalid/duplicate argument");
    options[match[1]] = match[2];
  }
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: false,
  });
  try {
    const client = mongoose.connection.getClient();
    let result;
    if (command === "plan")
      result = migration.summary(await migration.plan(client));
    else if (command === "verify") {
      await migration.verifyApplied(client);
      result = { verified: true };
    } else {
      if (!options.backup)
        throw new Error("Explicit encrypted backup path required");
      const file = localPath(options.backup);
      if (command === "backup")
        result = {
          ...(await createBackup(client, file)),
          ...(await verifyRestore(client, file)),
        };
      else {
        if (!/^[a-f0-9]{64}$/.test(options["backup-hash"] || ""))
          throw new Error("Backup checksum required");
        await verifyRestore(client, file);
        result = await migration[command](client, file, options["backup-hash"]);
      }
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}
main().catch(() => {
  console.error(
    "Store migration stopped. Check connectivity, verified backup, and ownership/lease preconditions; credentials are never printed.",
  );
  process.exitCode = 1;
});
