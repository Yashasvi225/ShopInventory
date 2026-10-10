const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { BSON } = require('mongoose').mongo;
const root = path.resolve(__dirname, '../..');
const hash = value => createHash('sha256').update(BSON.serialize(value)).digest('hex');
function localPath(file) {
  const resolved = path.resolve(file);
  if (!resolved.toLowerCase().startsWith((root + path.sep).toLowerCase())) throw new Error('Backup must stay inside SIM_P2');
  return resolved;
}
function protect(bytes, decrypt = false) {
  if (process.platform !== 'win32') throw new Error('This backup requires Windows DPAPI');
  const script = `$ErrorActionPreference='Stop'; try {
    Add-Type -AssemblyName System.Security
    $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd())
    $result=[Security.Cryptography.ProtectedData]::${decrypt ? 'Unprotect' : 'Protect'}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Convert]::ToBase64String($result))
  } catch { [Console]::Error.WriteLine('Backup encryption failed.'); exit 1 }`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: bytes.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) throw new Error('Backup encryption failed; use its original Windows account');
  return Buffer.from(result.stdout.trim(), 'base64');
}
async function snapshot(client) {
  const db = client.db(), definitions = await db.listCollections().toArray();
  if (definitions.some(item => item.type !== 'collection')) throw new Error('Unsupported database view; backup refused');
  const collections = [];
  for (const item of definitions) collections.push({ name: item.name, options: item.options,
    indexes: await db.collection(item.name).listIndexes().toArray() });
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      for (const item of collections) item.documents = await db.collection(item.name).find({}, { session }).sort({ _id: 1 }).toArray();
    }, { readConcern: { level: 'snapshot' } });
  } finally { await session.endSession(); }
  return { kind: 'SIM_P2_DATABASE_BACKUP', version: 1, database: db.databaseName, createdAt: new Date(), collections };
}
async function createBackup(client, file) {
  file = localPath(file);
  const data = await snapshot(client), bytes = BSON.serialize(data), digest = createHash('sha256').update(bytes).digest('hex');
  const encrypted = protect(bytes);
  if (!protect(encrypted, true).equals(bytes)) throw new Error('Backup round-trip verification failed');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ kind: 'SIM_P2_DPAPI_BACKUP', version: 1, sha256: digest, ciphertext: encrypted.toString('base64') }), { flag: 'wx', mode: 0o600 });
  return { file, sha256: digest, counts: Object.fromEntries(data.collections.map(item => [item.name, item.documents.length])) };
}
function readBackup(file) {
  let envelope;
  try { envelope = JSON.parse(fs.readFileSync(localPath(file), 'utf8')); } catch { throw new Error('Backup could not be read'); }
  if (envelope.kind !== 'SIM_P2_DPAPI_BACKUP' || envelope.version !== 1 || !/^[a-f0-9]{64}$/.test(envelope.sha256)
    || typeof envelope.ciphertext !== 'string') throw new Error('Unrecognized encrypted backup');
  const bytes = protect(Buffer.from(envelope.ciphertext, 'base64'), true);
  if (createHash('sha256').update(bytes).digest('hex') !== envelope.sha256) throw new Error('Backup checksum mismatch');
  const data = BSON.deserialize(bytes);
  if (data.kind !== 'SIM_P2_DATABASE_BACKUP' || data.version !== 1 || !Array.isArray(data.collections)) throw new Error('Invalid backup contents');
  return { data, sha256: envelope.sha256 };
}
async function verifyRestore(client, file) {
  const { data, sha256 } = readBackup(file), token = randomUUID().replaceAll('-', ''), name = `simb_${token}`;
  if (name === client.db().databaseName || name === data.database) throw new Error('Unsafe restoration target');
  const db = client.db(name); let owned = false;
  try {
    if ((await db.listCollections().toArray()).length) throw new Error('Restore test database already exists');
    await db.collection('__backup_verification_owner').insertOne({ _id: token }); owned = true;
    for (const item of data.collections) {
      await db.createCollection(item.name, item.options);
      if (item.documents.length) await db.collection(item.name).insertMany(item.documents);
      for (const definition of item.indexes.filter(index => index.name !== '_id_')) {
        const { key, v, ns, ...options } = definition;
        await db.collection(item.name).createIndex(key, options);
      }
      const restored = await db.collection(item.name).find({}).sort({ _id: 1 }).toArray();
      if (restored.length !== item.documents.length || restored.some((doc, index) => hash(doc) !== hash(item.documents[index]))) throw new Error('Restored documents differ from backup');
      const actual = await db.collection(item.name).listIndexes().toArray();
      const normalize = index => Object.fromEntries(Object.entries(index).filter(([key]) => !['v', 'ns'].includes(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, key === 'key' ? Object.entries(value) : value]));
      const ordered = indexes => indexes.map(normalize).sort((a, b) => a.name.localeCompare(b.name));
      if (hash({ indexes: ordered(actual) }) !== hash({ indexes: ordered(item.indexes) })) throw new Error('Restored indexes differ from backup');
    }
    return { file: localPath(file), sha256, verifiedRestore: true,
      counts: Object.fromEntries(data.collections.map(item => [item.name, item.documents.length])) };
  } finally {
    if (owned) {
      if (!/^simb_[a-f0-9]{32}$/.test(name) || !(await db.collection('__backup_verification_owner').findOne({ _id: token }))) throw new Error('Restore test cleanup ownership check failed');
      await db.dropDatabase();
    }
  }
}
module.exports = { createBackup, readBackup, verifyRestore, hash, localPath };
