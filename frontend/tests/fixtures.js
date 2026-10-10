import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { MongoClient, ObjectId } = requireBackend('mongoose').mongo;
requireBackend('dotenv').config({ path: fileURLToPath(new URL('../../backend/.env', import.meta.url)), quiet: true });

export async function withDatabase(run) {
  const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  try { await client.connect(); return await run(client.db()); }
  finally { await client.close(); }
}
export const test = base.extend({
  account: async ({}, use) => {
    const id = randomUUID();
    const account = { email: `verify-${id}@example.invalid`, name: `Migration verification ${id}`, password: `Verification-${id}`, additional: [] };
    try { await use(account); }
    finally {
      // Only exact test-owned identities and their records are eligible for cleanup.
      await withDatabase(async db => {
        for (const identity of [account, ...account.additional]) {
          const user = await db.collection('users').findOne({ email: identity.email, name: identity.name });
          if (!user) continue;
          const owner = { createdBy: new ObjectId(user._id) };
          for (const collection of ['expiryalerts', 'sales', 'stocktransactions', 'products', 'suppliers', 'stores']) await db.collection(collection).deleteMany(owner);
          await db.collection('users').deleteOne({ _id: user._id, email: identity.email });
        }
      });
    }
  },
});
export { expect, ObjectId };

export async function register(request, account, shopType) {
  const registered = await request.post('http://localhost:5000/api/auth/register', { data: { name: account.name, email: account.email, password: account.password } });
  expect(registered.status()).toBe(201);
  const session = await registered.json();
  const headers = { Authorization: `Bearer ${session.token}` };
  if (shopType) {
    const selected = await request.put('http://localhost:5000/api/auth/shop-type', { headers, data: { shopType } });
    expect(selected.status()).toBe(200);
    session.user = (await selected.json()).user;
  }
  return { ...session, headers };
}
