import { createRequire } from 'node:module';
import { test, expect, withDatabase } from './fixtures.js';
import { EMAIL_MESSAGE, PASSWORD_MESSAGE, PASSWORD_LENGTH_MESSAGE } from '../src/utils/authValidation.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const bcrypt = requireBackend('bcrypt');
const base = 'http://localhost:5000/api/auth';
const invalidEmails = ['abc', 'test@', '@gmail.com', 'test@gmail', 'test..user@gmail.com', 'test@-gmail.com', 'test@gmail-.com',
  'test@g_mail.com', 'test@gmail..com', 'test@gmail.c', 'test@gmail.123', 'te st@gmail.com', 'test@ gmail.com', 'test@@gmail.com', 'test@gmail.com.', '', ' ', null, [], {}];
const weakPasswords = ['password', 'PASSWORD123', 'Password123', 'Pass@1', '', '        ', 'password@123', 'PASSWORD@123', 'Password@abc'];
const fieldError = (page, label) => page.getByLabel(label, { exact: true }).locator('..').locator('.field-error');

test.beforeEach(async () => {
  expect(process.env.NODE_ENV).toBe('test');
  expect(process.env.GEMINI_API_KEY).toBe('');
  await withDatabase(async db => {
    expect(db.databaseName).toMatch(/^sim_[a-f0-9]{32}$/);
    expect(await db.collection('__verification_owner').findOne({ _id: db.databaseName.slice(4) })).not.toBeNull();
  });
});

test('Registration validates inline without requests, then preserves a strong spaced password, normalized identity, session and logout', async ({ page, request, account }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const submissions = []; page.on('request', req => { if (req.url().endsWith('/auth/register') && req.method() === 'POST') submissions.push(req.postDataJSON()); });
  await page.goto('/register');
  await expect(page.getByText(PASSWORD_MESSAGE, { exact: true })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(account.name);
  await page.getByLabel('Password', { exact: true }).fill('ShopSecure@123');
  await page.getByLabel('Confirm Password').fill('ShopSecure@123');
  for (const email of invalidEmails.filter(email => typeof email === 'string' && email !== ' ')) {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(fieldError(page, 'Email')).toHaveText(EMAIL_MESSAGE);
  }
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  for (const password of weakPasswords) {
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm Password').fill(password);
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(fieldError(page, 'Password')).toHaveText(PASSWORD_MESSAGE);
  }
  expect(submissions).toHaveLength(0);
  account.password = ' ShopSecure@123 ';
  await page.getByLabel('Email', { exact: true }).fill('  ' + account.email.toUpperCase() + '  ');
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByLabel('Confirm Password').fill(account.password);
  await page.getByRole('checkbox',{name:'Grocery Store',exact:true}).check();
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(submissions).toHaveLength(1);
  expect(submissions[0].email).toBe(account.email);
  expect(submissions[0].password === account.password).toBeTruthy();
  const stored = await withDatabase(db => db.collection('users').findOne({ email: account.email, name: account.name }));
  expect(stored).not.toBeNull(); expect(stored.password.startsWith('$2')).toBeTruthy();
  expect(await bcrypt.compare(account.password, stored.password)).toBeTruthy();
  expect(await bcrypt.compare(account.password.trim(), stored.password)).toBeFalsy();
  const duplicate = await request.post(base + '/register', { data: { name: account.name, email: ' ' + account.email.toUpperCase() + ' ', password: account.password } });
  expect(duplicate.status()).toBe(409); expect((await duplicate.json()).message).toBe('Email already registered');
  await expect(page).toHaveURL(/\/dashboard$/);
  const token = await page.evaluate(() => localStorage.getItem('token')); expect(token).toBeTruthy();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe(token);
  await page.getByRole('link', { name: 'Logout', exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  await page.getByLabel('Email', { exact: true }).fill(' ' + account.email.toUpperCase() + ' ');
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
  expect((await withDatabase(db => db.collection('users').findOne({ _id: stored._id }))).password === stored.password).toBeTruthy();
  expect(errors).toEqual([]);
});

test('Backend rejects invalid email and weak password requests directly, supports the requested valid addresses, and rejects normalized duplicates', async ({ request, account }) => {
  const count = () => withDatabase(db => db.collection('users').countDocuments({}));
  const before = await count();
  for (const email of invalidEmails) for (const endpoint of ['/register', '/login']) {
    const response = await request.post(base + endpoint, { data: { name: account.name, email, password: 'ShopSecure@123' } });
    expect(response.status()).toBe(400); expect((await response.json()).message).toBe(EMAIL_MESSAGE);
  }
  for (const password of [...weakPasswords, null, [], {}]) {
    const response = await request.post(base + '/register', { data: { name: account.name, email: account.email, password } });
    expect(response.status()).toBe(400); expect((await response.json()).message).toBe(PASSWORD_MESSAGE);
  }
  for (const password of ['Aa1!' + 'a'.repeat(69), 'Aa1!' + '\u00e9'.repeat(35)]) {
    const response = await request.post(base + '/register', { data: { name: account.name, email: account.email, password } });
    expect(response.status()).toBe(400); expect((await response.json()).message).toBe(PASSWORD_LENGTH_MESSAGE);
  }
  expect(await count()).toBe(before);
  for (const email of ['user@gmail.com', 'first.last@example.com', 'user+shop@example.co.in']) {
    const registered = await request.post(base + '/register', { data: { name: account.name, email: ' ' + email.toUpperCase() + ' ', password: 'ShopSecure@123' } });
    expect(registered.status()).toBe(201); const session = await registered.json();
    expect(session.user.email).toBe(email); expect(session.user.password).toBeUndefined();
    const stored = await withDatabase(db => db.collection('users').findOne({ email, name: account.name })); expect(stored).not.toBeNull();
    expect(await bcrypt.compare('ShopSecure@123', stored.password)).toBeTruthy();
    expect((await request.post(base + '/register', { data: { name: account.name, email: ' ' + email.toUpperCase() + ' ', password: 'ShopSecure@123' } })).status()).toBe(409);
    expect((await request.post(base + '/login', { data: { email: ' ' + email.toUpperCase() + ' ', password: 'ShopSecure@123' } })).status()).toBe(200);
  }
  expect(await count()).toBe(before + 3);
  for (const email of ['user@gmail.com', 'nonexistent@example.com']) {
    const response = await request.post(base + '/login', { data: { email, password: 'incorrect' } });
    expect(response.status()).toBe(401); expect((await response.json()).message).toBe('Invalid email or password');
  }
});

test('Existing weak short whitespace-bearing bcrypt credentials still log in literally and the stored user remains unchanged', async ({ page, request, account }) => {
  const password = ' old ';
  const hash = await bcrypt.hash(password, 12);
  // Insert a legacy-shaped account only in this invocation-owned test database.
  const stored = await withDatabase(async db => {
    const document = { name: account.name, email: account.email, password: hash, shopType: 'GROCERY', shopName: 'Legacy validation verification', createdAt: new Date() };
    const inserted = await db.collection('users').insertOne(document);
    await db.collection('stores').insertOne({createdBy:inserted.insertedId,shopType:'GROCERY',name:document.shopName,createdAt:new Date(),updatedAt:new Date()});
    return db.collection('users').findOne({ _id: inserted.insertedId });
  });
  await page.goto('/login');
  await expect(page.getByLabel('Password', { exact: true })).not.toHaveAttribute('minlength', /.+/);
  await expect(page.getByText(PASSWORD_MESSAGE, { exact: true })).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill(' ' + account.email.toUpperCase() + ' ');
  await page.getByLabel('Password', { exact: true }).fill(password.trim());
  await page.getByRole('button', { name: 'Login', exact: true }).click(); await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect((await request.get('http://localhost:5000/api/auth/shop-type', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);
  await page.reload(); await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  expect(await withDatabase(db => db.collection('users').findOne({ _id: stored._id }))).toEqual(stored);
});

test('Login rejects malformed emails and blank passwords without applying registration strength checks', async ({ page, request, account }) => {
  await page.goto('/login');
  await page.getByLabel('Password', { exact: true }).fill('x');
  for (const email of ['abc', 'test@gmail', 'test..user@gmail.com', 'test@-gmail.com', '']) {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Login', exact: true }).click(); await expect(fieldError(page, 'Email')).toHaveText(EMAIL_MESSAGE);
  }
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Login', exact: true }).click(); await expect(fieldError(page, 'Password')).toHaveText('Password is required');
  for (const password of ['', null, [], {}]) {
    const response = await request.post(base + '/login', { data: { email: account.email, password } });
    expect(response.status()).toBe(400); expect((await response.json()).message).toBe('Password is required');
  }
  await page.getByLabel('Password', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Login', exact: true }).click(); await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
});
