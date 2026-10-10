const mongoose = require('mongoose');
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const User = require('../models/User');
const Dataset = require('./DemoDataset');
const { seedDemo, cleanupDemo, verifyOwnership, requireDevelopment } = require('./seed');
const { PRESENTATION_NAMESPACE: namespace, datasetKey, identity } = require('./data');
const { SHOP_TYPES } = require('../domain/storeTypes');
const { registrationPassword } = require('../utils/authValidation');
const { generatePasswords, protectPasswords, unprotectPasswords, readVault, writeVault, newVault } = require('./presentationCredentials');
const { assertDatasetUnmigrated } = require('../migrations/guard');

async function matchingPasswords(vault, manifest) {
  if (!manifest) {
    if (!vault.current || vault.pending) throw new Error('No demo manifest matches the pending credential reset');
    return unprotectPasswords(vault.current);
  }
  await verifyOwnership(manifest);
  for (const slot of ['pending', 'current']) {
    if (!vault[slot]) continue;
    const passwords = unprotectPasswords(vault[slot]);
    let matched = true;
    for (const owner of manifest.owners) {
      const user = await User.findById(owner.userId).select('+password');
      if (!user || !(await user.comparePassword(passwords[owner.shopType]))) { matched = false; break; }
    }
    if (matched) {
      // Recover either side of an interrupted DB/file reset without guessing.
      if (vault.pending) { vault.current = vault[slot]; vault.pending = null; writeVault(vault); }
      return passwords;
    }
  }
  throw new Error('Saved demo credentials do not match; no accounts were overwritten. Use the explicit demo reset command.');
}
function displayCredentials(passwords) {
  console.log('PRIVATE LOCAL CREDENTIALS: copy to your password manager; do not share this terminal or commit its output.');
  for (const type of SHOP_TYPES) console.log(`LOCAL_DEMO_CREDENTIAL ${type} ${identity(type, namespace).email} ${passwords[type]}`);
}
async function main() {
  requireDevelopment();
  const command = process.argv[2];
  if (!['seed', 'credentials', 'reset-passwords', 'cleanup'].includes(command) || process.argv.length !== 3) throw new Error('Use the presentation seed, credential, reset-passwords or cleanup npm command');
  if (!process.env.MONGO_URI) throw new Error('Configure backend/.env MONGO_URI first');
  let generated = false;
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  try {
    await assertDatasetUnmigrated(datasetKey(namespace));
    let vault = command === 'cleanup' ? null : readVault();
    if (command === 'seed' && !vault) { vault = newVault(protectPasswords(generatePasswords())); writeVault(vault, undefined, true); generated = true; }
    if (command === 'cleanup') { console.log(JSON.stringify(await cleanupDemo(namespace))); return; }
    const manifest = await Dataset.findById(datasetKey(namespace)).lean();
    if (command === 'reset-passwords') {
      if (!manifest) throw new Error('Seed the presentation accounts before resetting their passwords');
      await verifyOwnership(manifest);
      const passwords = generatePasswords();
      const protectedPasswords = protectPasswords(passwords);
      vault = vault || newVault(null, protectedPasswords);
      vault.pending = protectedPasswords; writeVault(vault);
      await mongoose.connection.transaction(async session => {
        const current = await Dataset.findById(datasetKey(namespace)).session(session).lean();
        await verifyOwnership(current, session);
        for (const owner of current.owners) {
          const user = await User.findById(owner.userId).session(session);
          user.password = registrationPassword(passwords[owner.shopType]); await user.save({ session });
        }
      });
      vault.current = vault.pending; vault.pending = null; writeVault(vault);
      console.log('Only the four manifest-verified presentation account passwords were reset. Inventory and history were preserved.');
      displayCredentials(passwords); return;
    }
    if (!vault) throw new Error('The encrypted local credential file is missing. Restore it under the same Windows account or explicitly reset presentation passwords.');
    const passwords = await matchingPasswords(vault, manifest);
    if (command === 'credentials') {
      if (!manifest) throw new Error('Seed the presentation accounts first');
      displayCredentials(passwords); return;
    }
    const result = await seedDemo({ namespace, passwords });
    console.log(result.inserted ? 'Presentation dataset created.' : 'Presentation dataset already exists; existing records were preserved.');
    console.table(result.stores);
    if (generated && result.inserted) displayCredentials(passwords);
    console.log('Passwords are stored encrypted with Windows DPAPI in backend/.demo-presentation.local.json (ignored by Git).');
    console.log('For private local retrieval: npm run demo:credentials. See DEMO_LOGIN_GUIDE.md.');
    console.log('Initial estimates use the real calculation engine without a Gemini call. No successful AI response is fabricated.');
  } finally { await mongoose.disconnect(); }
}
main().catch(error => {
  // Validation errors are fixed messages; provider/DB diagnostics can contain secrets.
  const message = error.name === 'Error' && !error.code ? error.message : 'Database or credential operation failed; no unrelated records were reset.';
  console.error(`Presentation command stopped: ${message}`); process.exitCode = 1;
});
