const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { MongoClient } = require('mongoose').mongo;
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const backend = path.join(__dirname, '..');

async function run() {
  if (!process.env.MONGO_URI) throw new Error('Configure backend/.env first');
  try {
    const health = await fetch('http://localhost:5000/api/health', { signal: AbortSignal.timeout(1000) });
    if (health.ok()) throw new Error('Stop the existing API on port 5000 before offline browser tests');
  } catch (error) { if (error.message.startsWith('Stop the existing')) throw error; }
  const token = randomUUID().replaceAll('-', '');
  // Atlas limits database names to 38 bytes; four prefix + 32 random hex bytes.
  const databaseName = `sim_${token}`;
  const url = new URL(process.env.MONGO_URI), originalDatabase = url.pathname.slice(1);
  url.pathname = `/${databaseName}`;
  const uri = url.toString();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  // Reuse the verified replica hosts for isolated child processes. Every fixture
  // opens its own connection; repeated SRV lookups otherwise hit transient DNS
  // failures. Credentials stay in memory/environment, never in logs or files.
  let testUri = uri;
  if (url.protocol === 'mongodb+srv:') {
    const hosts = [...client.topology.description.servers.keys()];
    const query = new URLSearchParams(url.search);
    query.delete('srvMaxHosts'); query.delete('srvServiceName');
    query.set('tls', String(client.options.tls));
    if (client.options.replicaSet) query.set('replicaSet', client.options.replicaSet);
    if (client.options.credentials?.source) query.set('authSource', client.options.credentials.source);
    const credentials = url.username ? `${url.username}:${url.password}@` : '';
    testUri = `mongodb://${credentials}${hosts.join(',')}/${databaseName}?${query}`;
  }
  const env = { ...process.env, MONGO_URI: testUri, GEMINI_API_KEY: '', NODE_ENV: 'test', PORT: '5000' };
  let api, browser, owned = false;
  try {
    if ((await client.db(databaseName).listCollections().toArray()).length) throw new Error('Test database already exists; refusing reuse');
    await client.db(databaseName).createCollection('__verification_owner');
    await client.db(databaseName).collection('__verification_owner').insertOne({ _id: token });
    owned = true;
    api = spawn(process.execPath, [path.join(__dirname, 'helpers/offlineServer.js')], { cwd: backend, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let startup = '';
    const remember = chunk => { startup = (startup + chunk).slice(-6000); };
    api.stdout.on('data', remember); api.stderr.on('data', remember);
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (api.exitCode != null) {
        // Print only known error classifications, never raw provider/DB diagnostics.
        const category = /EADDRINUSE/.test(startup) ? 'port conflict' : /Cannot find module/.test(startup) ? 'missing module' : /authentication failed|bad auth/i.test(startup) ? 'database authentication' : /Database connection failed/.test(startup) ? 'database connection' : 'startup error';
        throw new Error(`Offline API exited before startup (${category}, exit ${api.exitCode})`);
      }
      try { ready = (await fetch('http://localhost:5000/api/health', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('Offline API failed to start');
    console.log('Running real browser/API tests in a new isolated MongoDB database with no paid AI calls.');
    const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    browser = spawn(process.execPath, [npmCli, '--prefix', '../frontend', 'test', '--', ...process.argv.slice(2)], { cwd: backend, env, stdio: 'inherit', windowsHide: true });
    const [code] = await once(browser, 'exit');
    process.exitCode = code == null ? 1 : code;
  } finally {
    if (browser && browser.exitCode == null) { browser.kill(); await once(browser, 'exit'); }
    if (api && api.exitCode == null) { api.kill(); await once(api, 'exit'); }
    // Only the exact random database created by this invocation is eligible.
    if (databaseName !== `sim_${token}` || !/^[a-f0-9]{32}$/.test(token) || databaseName === originalDatabase) throw new Error('Unsafe test database cleanup target');
    if (owned) {
      if (!(await client.db(databaseName).collection('__verification_owner').findOne({ _id: token }))) throw new Error('Test database ownership marker missing; refusing cleanup');
      await client.db(databaseName).dropDatabase();
    }
    await client.close();
    console.log(owned ? 'Removed this invocation\'s isolated test database. Existing application database untouched.' : 'Existing application database untouched; no test dataset was created.');
  }
}
run().catch(error => {
  const detail = error.name === 'Error' && !error.code ? error.message : `Database/connectivity error (${error.name}, code ${error.code || 'unavailable'}, ${error.codeName || 'unavailable'})`;
  let diagnostic = error.message;
  const secrets = [process.env.MONGO_URI, process.env.JWT_SECRET, process.env.GEMINI_API_KEY];
  try { const url = new URL(process.env.MONGO_URI); secrets.push(url.username, url.password, decodeURIComponent(url.password)); } catch {}
  for (const secret of secrets) if (secret) diagnostic = diagnostic.replaceAll(secret, '[redacted]');
  console.error(`Offline verification failed: ${detail}. ${diagnostic.slice(0, 400)}`); process.exitCode = 1;
});
