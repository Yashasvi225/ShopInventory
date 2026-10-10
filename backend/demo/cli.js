const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const mongoose = require("mongoose");
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});
const { seedDemo, cleanupDemo, requireDevelopment } = require("./seed");
const { registrationPassword } = require("../utils/authValidation");
const credentialPath = path.join(__dirname, "../.demo-data.local.json");

async function main() {
  requireDevelopment();
  const command = process.argv[2];
  if (!["seed", "cleanup"].includes(command) || process.argv.length !== 3)
    throw new Error("Use npm run seed:demo or npm run cleanup:demo");
  let password;
  if (command === "seed") {
    if (fs.existsSync(credentialPath)) {
      const saved = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
      if (saved.kind !== "SIM_P2_LOCAL_DEMO_CREDENTIALS")
        throw new Error(
          "Unrecognized demo credential file; refusing overwrite",
        );
      password = saved.password;
      if (
        process.env.SIM_DEMO_PASSWORD &&
        process.env.SIM_DEMO_PASSWORD !== password
      )
        throw new Error(
          "Credential file already exists; passwords are never silently changed",
        );
    } else {
      password =
        process.env.SIM_DEMO_PASSWORD ||
        `Aa1!${randomBytes(24).toString("base64url")}`;
      registrationPassword(password);
      fs.writeFileSync(
        credentialPath,
        JSON.stringify(
          { kind: "SIM_P2_LOCAL_DEMO_CREDENTIALS", password },
          null,
          2,
        ) + "\n",
        { flag: "wx", mode: 0o600 },
      );
    }
  }
  if (!process.env.MONGO_URI)
    throw new Error("Configure backend/.env MONGO_URI first");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    if (command === "cleanup")
      console.log(JSON.stringify(await cleanupDemo(), null, 2));
    else {
      const result = await seedDemo({ password });
      console.log(
        result.inserted
          ? "Demo dataset created."
          : "Demo dataset already exists; records were not reset.",
      );
      console.table(result.stores);
      console.log(
        "Local demo password is in backend/.demo-data.local.json (ignored by Git). It is never printed by this command.",
      );
      console.log(
        "Existing calculation engine generated initial application estimates without calling Gemini. See DEMO_DATA_GUIDE.md.",
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((error) => {
  const message =
    error.name === "Error" && !error.code
      ? error.message
      : "Database/file operation failed; existing records were not reset.";
  console.error(`Demo command stopped: ${message}`);
  process.exitCode = 1;
});
