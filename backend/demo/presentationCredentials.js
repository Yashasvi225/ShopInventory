const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { SHOP_TYPES } = require("../domain/storeTypes");
const { registrationPassword } = require("../utils/authValidation");
const { PRESENTATION_NAMESPACE } = require("./data");

const projectRoot = path.resolve(__dirname, "../..");
const credentialPath = process.env.SIM_DEMO_CREDENTIAL_FILE
  ? path.resolve(process.env.SIM_DEMO_CREDENTIAL_FILE)
  : path.join(__dirname, "../.demo-presentation.local.json");
if (
  !credentialPath
    .toLowerCase()
    .startsWith((projectRoot + path.sep).toLowerCase())
)
  throw new Error("Presentation credentials must stay inside SIM_P2");
const KIND = "SIM_P2_PRESENTATION_CREDENTIALS";
function generatePasswords() {
  const passwords = Object.fromEntries(
    SHOP_TYPES.map((type) => [
      type,
      `Aa1!${randomBytes(24).toString("base64url")}`,
    ]),
  );
  validatePasswords(passwords);
  return passwords;
}
function validatePasswords(passwords) {
  if (
    !passwords ||
    typeof passwords !== "object" ||
    Array.isArray(passwords) ||
    Object.keys(passwords).length !== SHOP_TYPES.length
  )
    throw new Error("Four distinct demo credentials are required");
  for (const type of SHOP_TYPES) registrationPassword(passwords[type]);
  if (new Set(Object.values(passwords)).size !== SHOP_TYPES.length)
    throw new Error("Each presentation account must have a unique password");
  return passwords;
}
function transformPasswords(values, decrypt = false) {
  if (process.platform !== "win32")
    throw new Error(
      "Encrypted presentation credentials require Windows DPAPI under your local Windows account",
    );
  // Credentials travel through stdin, never command arguments, environment or files.
  const script = `$ErrorActionPreference = 'Stop'
try {
  $inputValues = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $result = @{}
  foreach ($property in $inputValues.PSObject.Properties) {
    ${
      decrypt
        ? `$secure = ConvertTo-SecureString -String $property.Value
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $result[$property.Name] = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }`
        : `$secure = ConvertTo-SecureString -String $property.Value -AsPlainText -Force
    $result[$property.Name] = ConvertFrom-SecureString -SecureString $secure`
    }
  }
  $result | ConvertTo-Json -Compress
} catch { [Console]::Error.WriteLine('Windows credential protection failed.'); exit 1 }`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      input: JSON.stringify(values),
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 64 * 1024,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      "Windows credential protection failed; use the same Windows account that created the vault",
    );
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    throw new Error("Windows credential protection returned an invalid result");
  }
}
const protectPasswords = (passwords) =>
  transformPasswords(validatePasswords(passwords));
const unprotectPasswords = (encrypted) =>
  validatePasswords(transformPasswords(encrypted, true));
function validateVault(vault) {
  if (
    !vault ||
    vault.kind !== KIND ||
    vault.version !== 1 ||
    vault.namespace !== PRESENTATION_NAMESPACE ||
    Object.keys(vault).some(
      (key) =>
        !["kind", "version", "namespace", "current", "pending"].includes(key),
    ) ||
    (!vault.current && !vault.pending)
  )
    throw new Error(
      "Unrecognized presentation credential file; refusing overwrite",
    );
  for (const values of [vault.current, vault.pending].filter(Boolean)) {
    if (
      typeof values !== "object" ||
      Array.isArray(values) ||
      Object.keys(values).length !== SHOP_TYPES.length ||
      SHOP_TYPES.some(
        (type) =>
          typeof values[type] !== "string" ||
          !/^[a-f0-9]{100,}$/i.test(values[type]),
      )
    )
      throw new Error("Invalid encrypted presentation credential file");
  }
  return vault;
}
function readVault(file = credentialPath) {
  if (!fs.existsSync(file)) return null;
  try {
    return validateVault(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    throw new Error(
      "Unrecognized presentation credential file; refusing overwrite",
    );
  }
}
function writeVault(vault, file = credentialPath, exclusive = false) {
  validateVault(vault);
  if (exclusive) {
    fs.writeFileSync(file, JSON.stringify(vault, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    return;
  }
  if (fs.existsSync(file)) readVault(file);
  const temporary = `${file}.tmp-${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(vault, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
const newVault = (current = null, pending = null) => ({
  kind: KIND,
  version: 1,
  namespace: PRESENTATION_NAMESPACE,
  current,
  pending,
});
module.exports = {
  generatePasswords,
  validatePasswords,
  protectPasswords,
  unprotectPasswords,
  readVault,
  writeVault,
  newVault,
  credentialPath,
};
