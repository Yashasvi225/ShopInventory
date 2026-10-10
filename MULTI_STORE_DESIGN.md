# Multi-store support design before inventory migration

Status: historical design, selected by the user on 2026-10-10. The later
multi-store registration request is implemented separately; see
[MULTI_STORE_IMPLEMENTATION.md](MULTI_STORE_IMPLEMENTATION.md). The four-store
demo transfer and account retirement proposed below are **not authorized by that
request and are not part of this rollout**. Its earlier empty-target counts are
historical; the completed Grocery-only transfer remains intact.
Project: `C:\Users\Dell\OneDrive\Desktop\SIM_P2`.
Migration inspection: [ADMIN_DATA_MIGRATION_NOTES.md](ADMIN_DATA_MIGRATION_NOTES.md).

## Decision and scope

Separate authenticated accounts from the stores they own. Keep the existing login,
JWT subject, password hashing, registration policy and retailer authorization. Add
an explicit owned-store scope for inventory operations. Do not impersonate the
source retailers, share their credentials, or change `User.shopType` every time the
user switches stores.

The first release supports at most one store of each existing type per account:
Medical, Restaurant, Grocery and Clothing. This meets the four-store requirement
without introducing staff roles, shared memberships, arbitrary locations or an
administrator bypass. All users use the same ownership checks; an email address
does not grant privileges.

The target is the existing user `6ac91488a1321476acb6c897`
(`yaramattiyashu13@gmail.com`). Read-only reinspection confirmed its default type
is Grocery and all five inventory collection counts are zero. Its ID, password,
name, shop name and existing session identity must remain intact.

## Evidence from the current implementation

| Current code | Constraint that the design addresses |
| --- | --- |
| `backend/models/User.js` | One `shopType`; no administrator role or store membership |
| `backend/controllers/authController.js` | Switching type is rejected once incompatible products/suppliers exist |
| `backend/utils/stockWrite.js` and stock/sale controllers | Product type must equal the user's single type |
| Product/supplier controllers | Ownership is `createdBy`; supplier type must match the shop |
| Reports and AI controller | Owner-only queries would mix different stores after a four-store ownership transfer |
| `backend/services/expiryAlertService.js` | Scanner and worker currently resolve store eligibility from User and product type |
| `frontend/src/session.jsx` | Forms and expiry visibility derive from `user.shopType` |
| `frontend/src/hooks/useResource.js` | Reloads and request generations exist, but a store change is not a current dependency |

There is currently no stores collection. Both the older local and presentation
datasets remain intact: each has 48 products, 12 suppliers, 859 sales, 907 movements
and 18 stored alerts. Only the presentation dataset is the proposed transfer source.
Combining both datasets would duplicate historical demand.

## Proposed data model

Add `Store` in a `stores` collection:

| Field | Definition |
| --- | --- |
| `_id` | ObjectId; stable store identity |
| `createdBy` | Required User ObjectId; authenticated account owner |
| `shopType` | Required existing four-type enum |
| `name` | Validated store name; no copied demo owner/personal information |
| `createdAt`, `updatedAt` | Normal timestamps |

Unique index: `{ createdBy: 1, shopType: 1 }`. This explicitly limits each account
to one of each type; future multiple-location support would need a separate design.
Store type is immutable once created. Renaming a store must not mutate its type.

Add a `store` ObjectId to Product, Supplier, Sale, StockTransaction and ExpiryAlert.
Keep `createdBy` as the actual User ID on every record. Keep existing `shopType`,
fashion, expiry, prices, quantities and historical date fields unchanged.

Required invariants:

1. A record's `createdBy` must equal its Store's owner.
2. Product/Supplier type must equal their Store's type.
3. Product and supplier links must share both account and store.
4. Sale, movement and alert links must share their product's account and store.
5. Clothing products retain mandatory fashion categories and no expiry; Clothing
   cannot acquire expiry alerts.

Cross-document invariants require controller/service checks inside transactions;
MongoDB references alone do not enforce them. Never trust `store` or `createdBy`
submitted in a record body. Derive both from the authenticated request scope.

Keep the existing unique `{ createdBy, sku }` index and alert event uniqueness
`{ createdBy, product, expiryDay }`. Product IDs already distinguish store events,
so no change to dismissal identity is needed. Add account/store indexes for relevant
date, quantity and expiry queries. Exact index names/options must be captured and
validated during implementation; do not drop current indexes merely to ease migration.

## Request scope and API compatibility

JWT authentication continues to load the original User into `req.user`. New
store middleware resolves a separate immutable `req.store`:

- Optional `X-Store-Id` header: validate ObjectId, then load the Store with
  `{ _id: suppliedId, createdBy: req.user._id }`.
- No header: resolve the user's default Store matching `User.shopType`. The
  target's default remains Grocery; legacy clients continue using that store.
- Invalid identifier: 400. Missing/foreign Store: 404 without disclosing its owner.
  Unauthenticated request: existing 401. An account with no configured store must
  use the existing shop-selection path; it cannot access another account's store.

All inventory reads, writes, aggregates, populations and prediction inputs require
the filter `{ createdBy: req.user._id, store: req.store._id }`. Product-by-ID access
must include the same scope. Report `$match` stages need actual ObjectIds. Never
fall back to an owner-only query when an explicit store is invalid or unresolved.

Use `req.store.shopType` for the existing store validations. The User's identity
and default type must not be overwritten or substituted by middleware. Adapt
`ownedStockProduct` to accept the validated scope, including its transactional
lookup and atomic stock update condition.

Preserve current route URLs, write fields, response shapes, statuses and limits
where possible; `store` is an additive record field. Add protected `GET /api/stores`
and `POST /api/stores` for listing/configuring only owned stores. The server derives
the owner, validates the existing enum/name and rejects duplicate types. Creating
a store creates empty metadata, not presentation records.

Keep `/auth/login`, `/auth/register` and `/auth/shop-type` contracts. Registration
still creates an ordinary unselected user. First shop selection creates its empty
default Store transactionally with the existing shop settings. For existing clients,
type changes retain the current safeguards. A populated store's type cannot be
changed through that endpoint. Multi-store switching uses the request scope,
not `PUT /auth/shop-type`.

No automatic presentation seeding, public data endpoint, cross-account store
listing or email-specific administrator special case is introduced. Review CORS
handling for the new header with the existing configured client origins.

## Frontend behavior with the existing visual system

Use one accessible store selector beside the current store label in
`components/Layout.jsx`. It lists only server-returned owned stores; single-store
accounts retain their normal appearance. Preserve the seven destinations, colors,
spacing and all route URLs. A selector is the necessary functional addition, not a
page redesign or demo control.

Keep the real User in session context. Add `activeStore` and derive the business
`shopType`, `shopLabel` and store name from that verified Store. Account name/email
remain the real user's. Persist only a per-user store preference, cleared on logout
and revalidated after login; browser storage is never authorization.

The API wrapper sends the chosen Store ID on scoped requests and validates the new
store-list contract. Authentication requests remain unchanged. Existing record
contracts may accept the additive store field.

Store switching must not mix stale data or submissions:

- Key the page outlet by account/store so existing page resources, forms, filters,
  charts, pagination and local AI result state reset and reload for the new scope.
- Abort obsolete reads where possible and ignore their results. Bind each request
  to the store selected when it started, including slow AI requests.
- Disable switching while a form submission/stock/sale request is in progress.
  Confirm before discarding dirty forms; do not replay a write in another store.
- Keep a pending mutation's original scope until its response completes. Clear
  store-specific feedback on a completed switch and show normal loading/error states.
- Verify keyboard/mobile selector operation and Clothing's complete absence of
  expiry controls and warnings.

## Prediction, reports and expiry workers

Only the data scope changes. Preserve sales totals, periods, trends, replacement
formula, minimum-stock thresholds, no-sales behavior, Gemini validation, timeouts,
quota handling and deterministic fallback.

Manual reorder requests load products/sales for the active account/store and pass
that Store's type to the current provider. Seven-day expiry calculation retains
its owner/product historical basis; add consistent store filtering at data access.

The background scanner must join eligible products to **Stores and their owning
Users**, not require the user's default type to equal every product's type. The
worker checks alert, product and Store ownership/type together before claiming or
processing the event. Preserve event IDs, leases, retry limits, dates and dismissal
timestamps. Never migrate a live `GENERATING` claim; stop workers and settle/verify
leases before the transaction. Do not trigger paid Gemini calls in automated checks.

Dashboard/report calculations display only the selected store. An account-wide
combined dashboard is outside scope; existing numbers and labels should not silently
become four-store totals. Historical limits and UTC date semantics remain unchanged.

## Safe rollout and presentation migration

1. **Verify recovery first.** Quiesce writes/scanners; capture encrypted BSON
   snapshots, original indexes, exact IDs and before-state hashes for affected
   records/users/manifests. Test restoration into a uniquely owned isolated test
   database; confirm ObjectIds, dates, field values and references before live writes.
   Record the actual backup path and recovery command in the migration notes. No
   backup has yet been created or restoration tested in this design phase.
2. **Implement scopes in isolation.** Add optional store fields and Store model,
   request scope, all controllers/populations/aggregates and workers, then frontend
   selection. Complete the acceptance matrix below before application-data migration.
3. **Backfill existing retailers.** Validate each user's current store and data;
   create/reuse one default Store, preserve all user documents, and attach their
   existing records to it. Derive sales/movement/alert scopes from validated products.
   Fail on orphaned/mixed-type records instead of guessing. Unselected empty users
   remain unselected. Backfill each retailer transactionally and record exact changes.
   Account data quantities/values/dates remain unchanged; this is an additive scope
   migration. Disable writes until backfill validation completes.
4. **Enforce scope before enabling switching.** Require stores on newly written
   records; validate the completed backfill. Never serve a mixture of scoped and
   unscoped records through a broad `$or` authorization fallback. Keep normal startup
   free of demo seeding and migration writes.
5. **Transfer only the presentation set.** Resolve the verified target ID and four
   exact manifest owners again; create/reuse its Grocery default and add the other
   three Stores. Move the 1,844 inventory-related documents in a transaction by
   changing `createdBy` and `store` together. Preserve all product/supplier/sale/
   movement/alert IDs and relationships; zero copies are expected. Do not copy user
   passwords, identity fields or email-derived privileges. Existing target data, if
   newly added since inspection, remains in its compatible default Store.
6. **Normalize only transferred presentation fields.** Remove `[DEMO]` name
   prefixes and use collision-checked neutral SKUs such as `GROCERY-01`. Remove
   sample-only descriptions/company/address/email placeholders and opening-history
   labels rather than inventing real supplier contacts. Retain useful product names,
   Clothing variants and linked `Sale <id>` reasons. Audit embedded stored provider
   text; preserve estimates, status and dismissal rather than replacing AI output.
7. **Commit an idempotent audit.** A dedicated migration document records source
   manifests, exact record/source/target/store IDs, originals, backup identifier,
   counts and state. Enforce a unique migration key. A repeated invocation validates
   the committed IDs/relationships without rewriting inventory or generating sales.
   Retire the source manifest's executable lifecycle explicitly: seed/reset/cleanup
   must refuse transferred/retired sets and must never recreate their accounts or
   delete target inventory. Preserve the original manifest in the recovery archive.
   Migration audit metadata is not a user-facing demo label.
8. **Verify before retirement.** Check normal UI and ownership isolation, report
   totals per Store, real calculation inputs, no visible demo values and intact real
   accounts. The target password is not available to this agent: normal login must
   be verified by the user/private browser session without password disclosure or
   resetting authentication. Synthetic accounts can exercise login in isolated tests.
9. **Retire only verified sources.** Delete the four dedicated presentation User
   documents only after dependent inventory is transferred and manifests/audits no
   longer require a live source identity. Preserve source identity information in
   encrypted recovery/audit records. Existing JWTs already fail once those users
   cease to exist. Retain the older four local accounts and unrelated users. Review
   presentation credential commands/vault lifecycle so they cannot regenerate the
   retired accounts. If dependencies remain, retain accounts and report why.

## Rollback boundaries

Two changes need separate rollback records: legacy store backfill and the four-store
ownership transfer. Keep the backup encrypted, ignored by Git and recoverable under
the developer's local credential protection method. Do not save plaintext credentials
or connection strings in documentation or logs.

Before subsequent writes, a verified reverse transaction can restore audited source
owners, scope fields, original labels and manifests and recreate only deleted source
users from their protected before-images. Preserve target User/authentication and
all unrelated records. If any migrated record has changed or gained dependent sales,
movements, alerts or supplier links after cutover, stop and reconcile. Removing
stores or reverting to owner-only controllers is unsafe while that account owns
multiple store types. Never drop/reset the application database to roll back.

## Required acceptance matrix (not yet run)

| Area | Required evidence |
| --- | --- |
| Authentication | Existing login/passwords/JWT subject/session behavior and new registration unchanged; no email-based privileges |
| Store scope | Default Grocery compatibility; explicit owned Store; invalid/foreign identifiers denied; no-header requests never merge all stores |
| Isolation | All read/write/report/AI/alert APIs deny foreign accounts and wrong-store product/supplier IDs, including forged body fields |
| Normal users | Existing single-store records intact; newly registered account has no inventory; explicit new Store starts empty |
| Store rules | Optional expiry for applicable types; Clothing fashion required; no Clothing dates or alerts |
| Transactions | Stock In/Out and sales atomic; correct Store on both sale and movement; overselling/concurrent writes still rejected |
| Reports/predictions | Per-store histories/totals and calculated quantities unchanged; no-sales null, fallback/quota/provider errors honest |
| Expiry | All three applicable Stores detected even with Grocery default; event uniqueness/dismissal/retry/lease behavior preserved |
| Migration | Exact 48/12/859/907/18 source counts; stable IDs/links/balances; preserved target records; collision/orphan failures atomic |
| Repeat/recovery | Two executions produce identical records; restored backup matches before-state; no cleanup/reseed can damage transferred inventory |
| Frontend | Every route/store loads; no demo strings rendered; default login and logout; slow reads/AI and dirty/pending forms safe across switching |
| Responsive | Store selector at 375x812, 768x1024 and 1440x900; keyboard focus, loading/errors and labels remain accessible |

Run the existing backend suite, focused isolated browser/API tests and production
frontend build after implementation. Use invocation-owned databases and unavailable
provider adapters; never make paid Gemini calls or mutate real records to test CRUD.
Design/document-only changes do not verify this matrix, and previous test passes
are not evidence of multi-store behavior.

## Expected implementation files

New: Store model; owned-store middleware/controller/routes; backfill/transfer,
encrypted backup/recovery and audit tooling; multi-store authorization/migration tests.

Adapt: the five inventory models; product/supplier/stock/sale/report/AI/expiry
controllers; `utils/stockWrite.js`; `services/expiryAlertService.js`; protected route
middleware order; server Store routing; shop-selection integration. Gemini/domain
formulas remain untouched.

Frontend: `api.js`, `apiContract.js`, `session.jsx`, `storage.js`, `Layout.jsx`,
`ShopSelection.jsx` and outlet/resource lifecycle as needed. Page route URLs and
visual design remain intact. Add only selector styles necessary for the existing
theme and accessibility. No new dependency is planned.

This document is the separate design requested by the user. No new model, API,
selector, privilege, migration script, backup or database write has been implemented.
