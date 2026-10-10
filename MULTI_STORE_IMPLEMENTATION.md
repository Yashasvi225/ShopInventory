# Owned stores: registration, switching and migration

Implementation date: 2026-10-10 (Asia/Calcutta). Scope: SIM_P2 only.
This feature does not transfer any demo datasets or delete demo accounts.
The prior Grocery-only transfer remains intact.

## Architecture and compatibility

Authentication still uses the original User ID in the existing JWT. User schema,
password hashing, email/password validation, token lifetime and login responses
are unchanged. A Store has an immutable `createdBy` owner and `shopType`, a name,
and timestamps. `{createdBy, shopType}` is unique: one of each supported type per
account. No shared stores, staff roles, email-specific privileges or admin bypass.

Product, Supplier, Sale, StockTransaction and ExpiryAlert gain an additive `store`
ObjectId and an account/store index. Original IDs, ownership, product/supplier
references, history, quantities, prices, timestamps, fashion fields, expiry dates,
recommendations and dismissal identities are preserved. Existing unique SKU and
alert-event indexes remain in place. SKUs remain unique across the account, as in
the original application; use distinct SKUs for different stores.

`GET /api/stores` lists only stores owned by the authenticated account. Every
inventory/report/AI/alert route authenticates the User, resolves `X-Store-Id`
against `{_id, createdBy}`, then queries and writes with **both account and store**.
Malformed IDs return 400; foreign/unknown stores and wrong-store record IDs return
404. Forged body/query ownership fields are rejected. Record ownership is derived
on the server; product/supplier links and transactional stock/sale writes share
the same verified scope. Populations and report aggregates use that scope too.
Scoped CRUD and stock writes share a transactional Store revision lock. This
prevents a concurrent legacy empty-store conversion from deleting a Store while
an already-authorized request creates inventory inside it. It also keeps supplier
link changes and stock history transactional; response delivery follows commit.

No-header legacy clients use the store matching the User's original `shopType`.
An unconfigured account is directed to the existing shop-selection route and
cannot access inventory. Startup refuses an incomplete backfill. No owner-only
query fallback serves unscoped records.

`POST /api/auth/register` accepts `shopTypes`, a nonempty array of distinct uppercase
supported values. Account and selected Stores commit in one transaction. The new
React registration form requires at least one selection. For existing two-step API
clients, omission of `shopTypes` still creates an unselected account; explicit empty,
null, malformed, duplicate or unsupported selections fail. The existing shop-type
endpoint configures that account; populated or historical stores cannot be converted.
Multi-store accounts use the selector instead of changing their default User type.

## Using the feature

On Register, choose any nonempty combination of Medical, Restaurant, Grocery and
Clothing, then register with one email/password. The first selected store is the
default. Log in normally. Accounts with several stores receive an **Active store**
selector in the authenticated header. Single-store accounts retain the compact
store label; public pages have no switcher.

The selector verifies the new store through an authenticated backend request before
committing. A per-user browser preference persists across navigation and refresh,
but is accepted only after checking the server's owned-store list. Logout clears
the current preference. Switching does not change JWTs or require another login.

Changing stores remounts the page outlet, reloading resources, charts, forms,
filters, pagination and local recommendation results. Old resource responses cannot
replace the new page. Notifications clear; stale store-specific notifications are
ignored. Each API request captures its original store header. Scoped writes disable
switching until they finish, and content is inert while a switch is being verified.
Existing modal focus trapping/inert behavior protects open product/supplier/stock/
sale forms. Failed switches retain the prior store and show an accessible error.

Existing accounts receive only their original store. This task does not add an
account-management workflow for adding further stores to existing users. Multiple
locations of the same type and combined account-wide reports are outside scope.

## Business rules and workers

All business validations now read the active Store's type. Medical, Restaurant and
Grocery retain optional expiry dates. Clothing retains required Old Fashion/New
Fashion values and has no expiry controls or alerts.

Expiry scanning joins products to owned Stores and existing Users, including stores
that differ from a User's default type. Worker claims validate the alert's store,
owner and product; sales inputs use the same scope. Event identities, dismissal,
retry/lease behavior, UTC semantics, seven-day replacement estimate and no-sales
behavior are unchanged. Gemini provider code, structured validation, quota behavior,
manual purchase formulas and deterministic fallback were not modified.

## Backup and rollout commands

The normal API/watcher is stopped during the maintenance window. An encrypted BSON
backup includes every original collection, document and index. Windows DPAPI binds
decryption to this Windows account. Verified restoration creates and removes only
a random, marker-owned isolated database; the application database is never reset.

Backup: `backend/backups/owned-stores-2026-10-10.dpapi.json`.
Payload SHA-256:
`b02e6211bde2e73e1cd6458473b3268efc5096f4347df34e4d9d1c2b4317db78`.
Backup restoration succeeded before any backfill. It contains 18 Users, 101 Products,
27 Suppliers, 1,721 Sales, 1,821 StockTransactions, 37 ExpiryAlerts, two DemoDatasets,
the prior inventory migration audit and the initially empty Stores collection.

Run from `C:\Users\Dell\OneDrive\Desktop\SIM_P2\backend`:

```powershell
npm run migrate:stores -- plan
npm run migrate:stores -- backup --backup=backups/owned-stores-2026-10-10.dpapi.json
npm run migrate:stores -- apply --backup=backups/owned-stores-2026-10-10.dpapi.json --backup-hash=b02e6211bde2e73e1cd6458473b3268efc5096f4347df34e4d9d1c2b4317db78
npm run migrate:stores -- verify
```

Backfill validates every account/type and relationship before changing records.
Foreign/mixed-type/orphan alert records and active worker leases cause refusal.
The existing product deletion behavior retains sale/movement history; a missing
product link can retain its verified single-store owner's type without rewriting
that history. The actual database plan contained **zero missing product links**.
Empty unselected accounts are not silently granted a store.

Apply compares all original documents to the fresh backup, creates/reuses the
correct single owned Store, and attaches only `store` to inventory records in one
snapshot/majority transaction. Native bulk writes preserve business timestamps.
It records exact IDs and before/after hashes in `storemigrations/owned-stores-v1`.
Repeat execution validates scopes and performs no duplicate inserts or resets.
Migration is explicit, never a startup seed or automatic data reset.

Selective rollback, **only during deliberate recovery with API/workers stopped**:

```powershell
npm run migrate:stores -- rollback --backup=backups/owned-stores-2026-10-10.dpapi.json --backup-hash=b02e6211bde2e73e1cd6458473b3268efc5096f4347df34e4d9d1c2b4317db78
```

It checks Users, migrated records, added Stores and new dependencies, restores exact
inventory before-images, removes only audited added Stores and marks the audit
ROLLED_BACK. New stores/memberships also refuse rollback, preventing a return to
single-store controllers after multi-store accounts have been created.
Edited/new dependent records refuse rollback; reconcile without losing
data. Rolled-back migrations refuse automatic reapply. Restore the previous server
version before normal operation after rollback; the new server fails closed while
legacy records lack scopes. Additive indexes do not affect the old data values.
Never use whole-database restoration to discard later application writes. The older
Grocery ownership rollback also refuses after this additive backfill: reverse the
store backfill first only if both audits' safeguards permit it.

## Files changed

- Backend: new `models/Store.js`, `middleware/storeMiddleware.js`,
  `utils/storeScope.js`, `utils/storeSelection.js`, `utils/storeWrite.js`, `controllers/storeController.js`,
  `routes/storeRoutes.js`, `migrations/stores.js`, `migrations/storeCli.js` and
  `tests/multiStore.test.js`.
- Read-only preservation utility: `migrations/verifyStoreData.js` compares every
  original document to the protected snapshot after ignoring only the added scope.
- Backend: five inventory models, six protected inventory route files, auth/product/
  supplier/inventory/sale/report/AI/expiry controllers, `utils/stockWrite.js`,
  `services/expiryAlertService.js`, `server.js`, `package.json`.
- Demo compatibility: `demo/seed.js` creates scoped Store metadata when an existing
  explicitly invoked seed creates its own fixtures; cleanup removes only its verified
  owners' stores. `migrations/grocery.js` carries both owner and store on a separately
  invoked ownership transfer. Neither operation ran on live datasets for this feature.
- Frontend: `session.jsx`, `api.js`, `apiContract.js`, new `storeRequests.js`,
  `components/AuthForm.jsx`, `Layout.jsx`, `Toast.jsx`, `pages/Dashboard.jsx`,
  `styles.css`.
- Tests: new `frontend/tests/multi-store.spec.js`; adjusted fixtures and existing
  registration/transaction tests for actual new contracts and scope arguments.
- `backend/tests/runBrowserTests.js`: isolated test connections reuse verified
  replica hosts and the same resolved TLS/auth options to avoid repeated SRV DNS
  lookup failures. Only child test-process configuration changes; `.env` is intact.
- Documentation: this report, historical design pointer, user-confirmed Grocery
  login recorded in `ADMIN_DATA_MIGRATION_NOTES.md`.

No dependencies, environment values, provider/domain calculations or route URLs
were changed. React/Vite entry architecture and the existing theme are retained.

## Verification status

The live backfill completed successfully. Repeating the exact `apply` command
returned `repeated: true`, without duplicate stores or inventory records. There
are 18 original Users and 18 owned Stores. No store types were granted beyond each
existing account's original type. No demo ownership transfers, account deletions,
live seeds or live rollback were performed.

The following read-only check ran successfully twice after backfill and before
normal background workers resumed:

```powershell
node migrations/verifyStoreData.js backups/owned-stores-2026-10-10.dpapi.json
```

It compared all 3,728 original documents with the encrypted snapshot: 18 Users,
two demo manifests and the previous migration audit were exactly unchanged;
3,707 inventory-related documents differed only by the added `store` field.
Original IDs, password hashes, ownership, stock, history, dismissal state and
timestamps were preserved. Backup restoration and selective rollback were also
tested on marker-owned isolated databases; the live application database was
never restored or rolled back.

### Automated commands actually run

Commands below ran from `backend`, except the frontend build. External AI calls
were disabled/mocked during browser/API verification, and each runner removed
only its own isolated database.

| Command | Actual result |
| --- | --- |
| `npm test` | 88 passed, zero failed or skipped, after the final store transaction changes. |
| `npm run build` from `frontend` | Passed; Vite transformed 80 modules and produced the production bundle. |
| `npm run test:browser:offline -- tests/multi-store.spec.js tests/store-types.spec.js tests/migration.spec.js` | 19 passed in the earlier focused registration/store regression run. |
| `npm run test:browser:offline` | 73 executed: 71 passed, two failed because direct test fixtures omitted the new store relationship. Both fixtures were corrected and their tests subsequently passed in the focused run below. This was not a clean complete-suite run. |
| `npm run test:browser:offline -- tests/multi-store.spec.js tests/hardening.spec.js tests/expiry-alerts.spec.js tests/store-types.spec.js tests/inventory-ui.spec.js tests/sales-reports-ai-ui.spec.js tests/grocery-migration.spec.js` | 50 executed on the final store transaction implementation: 49 passed; one secondary migration fixture failed while using its previously loaded MongoDB URL parser. |
| `npm run test:browser:offline -- tests/multi-store.spec.js --grep 'Legacy backfill'` | The corrected secondary database fixture passed on a fresh invocation. Repeated after adding refusal for new store memberships: one passed in 9.6 seconds, including encrypted recovery, exact preservation, repeat application, refusal checks and selective rollback. |

Thus all 50 checks in the final focused browser/API set passed across the main
run and its corrected-fixture retry, with the recovery test passing again after
the last safeguard. The full suite was not rerun afterward; do not describe it as
an entirely passing final full-suite execution. An intervening isolated runner
startup hit a MongoDB SRV DNS failure before creating its test database. The
runner now reuses verified replica hosts and TLS/auth options in memory. Another
attempt encountered the running normal API; the normal watcher was then stopped
for the successful isolated recovery test and restored afterward.

Coverage includes all 15 nonempty selections at the validation layer, individual
and two/three/four-store API registration, ordinary login/logout, unchanged JWTs
while switching, preference persistence, failed switches, pending writes, product
and supplier CRUD, transactional stock/sales, report filtering, alerts/dismissal,
Clothing rules, three expiry-capable types, structured AI errors/fallback,
no-sales behavior, foreign-record/store rejection, forged scope fields, and the
legacy empty-store conversion race. Browser checks include all seven navigation
destinations and layouts at 375 x 812, 768 x 1024 and 1440 x 900.

### Live account and runtime checks

A read-only verification of the existing Grocery account found one authorized
Grocery Store, 12 products, three suppliers, 214 sales, 226 stock transactions and
five current upcoming-expiry warnings. All seven authenticated pages loaded
without browser errors, and the checked mobile, tablet and desktop layouts had
no horizontal overflow. A different account's Store ID was rejected with 404.
The single-store experience correctly had no unnecessary selector. AI displayed
the real deterministic fallback using scoped sales data; provider keys were
disabled for this verification.

The live browser check used a short-lived signed JWT through the existing
authentication middleware; it did not read, reset or test the user's actual
password. The user had previously confirmed private normal login and 12 products
after the Grocery transfer. Exact unchanged User/password hashes and isolated
legacy password/login tests provide the additional migration compatibility
evidence. Successful live Gemini calls were not tested.

The normal `npm run dev` API is restored on port 5000 and the existing Vite
frontend remains on port 5500. Environment files and dependencies are unchanged.
Remaining scope limitations: adding stores to an already registered account,
multiple locations of one type, and combined account-wide reports are not
implemented. SKUs retain their existing account-wide uniqueness constraint.
