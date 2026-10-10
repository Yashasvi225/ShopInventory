# Stage 2 — Store types and product management

Project: `C:\Users\Dell\OneDrive\Desktop\SIM_P2`. Stage 1 was reused; the existing
React/Vite architecture, page URLs, port 5500 and visual theme remain in place.
CycleJournal and `legacy/frontend` were not modified.

## Audit before changes

Read `MIGRATION_NOTES.md` and traced the React session, shop selection, products,
suppliers, inventory, sales, dashboard, reports and API client into the backend
models, controllers, routes, validators and MongoDB configuration.

The current retailer is the authenticated `User`; its `shopType` and optional
`shopName` identify its shop. Products and suppliers reference the retailer via
`createdBy` and already persist `shopType`. Stock transactions and sales reference
the product and retailer. There is no separate shop collection or multi-shop
selection feature to extend.

Read-only database inspection found:

| Collection / attribute | Existing state |
| --- | --- |
| Users | 4: three Grocery, one Medical |
| Products | 3, all Grocery |
| Suppliers | 1 |
| Sales | 2 |
| Stock transactions | 4 |
| Products with expiry dates | 1 |
| Products with clothing classification | 0 |
| Products without a store type | 0 |
| Retailer/product store-type mismatches | 0 |

All existing documents were fingerprinted before changes to verify preservation
after testing. Inspection did not print names, emails, passwords, API keys or
connection strings. No existing database records were migrated, reset or seeded.

## Store-specific behavior

| Store | Category | Product attribute | Validation |
| --- | --- | --- | --- |
| Medical | Existing Medical choices | Expiry Date | Optional, valid date when supplied; expired sales rejected |
| Restaurant | Existing category field as free text | Expiry Date | Same existing optional date/expired-sale rules |
| Grocery | Existing Grocery choices | Expiry Date | Same existing optional date/expired-sale rules |
| Clothing | Existing category field as free text | Old Fashion / New Fashion | Explicit valid fashion selection required; expiry is not applicable |

No size, color, brand, fabric, season, menu, recipe or other attributes were added.
No arbitrary Restaurant/Clothing category lists were introduced. Free-text
category is optional for these new stores, matching the existing backend's
optional category field. Existing Medical/Grocery form category requirements
remain unchanged; already saved custom categories are also retained in editing.

Product forms, editing, lists, category/search filters and stock status continue
using the existing components. Clothing forms have no expiry input or expiry
property in their submitted payload. They use the existing palette and badge
styles for the fashion column and a fashion filter. Classification persists on
edit and across page reloads. The selected retailer's store type is not requested
again for each product.

Inventory transaction rows now include the selected store's relevant attribute:
expiry for Medical/Restaurant/Grocery or fashion for Clothing. The transaction
form shows the selected product's same metadata. Sales retain stock, pricing,
totals and validation; Clothing sales show fashion instead of expiry.

Clothing dashboard/report views omit expiry indicators. Existing dashboard
cards, charts, sales summaries and inventory calculations are otherwise unchanged.
Backend expiry reports/counts explicitly exclude Clothing, including any
pre-existing malformed Clothing record with a date. Existing 30-day expiry
reporting remains; no two-day alert engine was added.

## Backend and API changes

- `User.shopType`, `Product.shopType`, `Supplier.shopType` and the existing shop
  validator accept exactly `MEDICAL`, `RESTAURANT`, `GROCERY`, `CLOTHING`.
  Retailers may still have `null` before selecting their shop; no Grocery default
  is inferred from absent retailer data.
- The only new persisted product field is `fashionType`, with `OLD_FASHION` and
  `NEW_FASHION` values. It is required only for Clothing; default `null` keeps
  existing Medical/Grocery records compatible. Other stores reject nonempty
  fashion classifications.
- Clothing creation/update ignores submitted expiry values before date casting;
  persistence normalizes expiry to `null`. The schema also clears Clothing
  expiry before validation. Thus even stale clients sending an invalid or past
  date cannot make Clothing fail expiry validation or persist an expiry value.
- Non-Clothing expiry stays optional. Existing Mongoose date validation, price,
  quantity, SKU, supplier and ownership rules remain.
- Product creation derives its type from the authenticated retailer. A supplied
  conflicting type is rejected. Editing does not silently convert a product's
  saved store type. Suppliers must belong to the owner and selected store.
- The existing PUT `/api/auth/shop-type` rejects incompatible type changes with
  409 when owned products or suppliers use another type. It does not rewrite or
  delete them. Same-type updates remain available, and a shop with no conflicting
  records can select a different supported type.
- Added GET on the **same** `/api/auth/shop-type` resource, returning `{ user }`
  from the JWT-authenticated retailer. The React session uses it at restoration
  to replace stale cached shop information and handle token-only legacy sessions.
  Missing selections go to the existing shop-selection page, not an invented
  default. Connection errors provide loading/error/retry handling.
- Existing product endpoints and response structures are retained; `fashionType`
  is additive. Inventory's populated `product` adds `shopType`, `expiryDate` and
  `fashionType` to support its relevant display. No duplicate CRUD endpoints.
- Clothing sales bypass expiry constraints even if a legacy date is present;
  insufficient stock remains rejected. Other stores retain the existing expired
  product and insufficient-stock checks and transaction/rollback behavior.

The existing Gemini service, model/key configuration, calculation, prompts,
validation, retries and rule-based fallback were not replaced or expanded.
The AI controller passes `null` expiry for Clothing so an irrelevant legacy date
cannot affect the existing reorder service. No expiry notification, forecasting
workflow or inventory mutation by Gemini was implemented.

## Backward compatibility / migration

No database migration is required for the inspected existing data. Existing
retailer selections, product fields, supplier links, sales and transactions
remain valid. Legacy products do not need an explicit `fashionType` field written
to MongoDB; Mongoose supplies `null` without rewriting the document.

An unselected retailer remains unselected until it chooses one of the four
types. If other imported data has missing/conflicting product or supplier store
types, it must be reviewed against its actual retailer before a type conversion;
there is no automatic arbitrary reassignment. No such record was found here.
Changing an existing populated shop to Clothing would require a separately
reviewed data conversion, including explicit fashion choices; this stage does
not perform that destructive conversion.

## Verification

Backend schema tests cover optional/valid/invalid expiry, clothing normalization,
required/invalid fashion classifications, store enums and legacy products.
Playwright tests use headless Chrome, the running backend and real MongoDB,
checking every store's actual UI creation/editing, persisted attributes, stock
IN/OUT, sales, reports, suppliers, login/logout, session recovery, mobile
navigation, rejected changes and ownership isolation. All verification records
belong to unique temporary accounts and are removed in fixture teardown; no
mock API responses are used.

Actual command results are recorded after the final run below.

## Observed verification results

- `npm test` in `backend`: **11 schema tests passed**, zero failures. These
  tests use actual Mongoose validation without a database connection.
- `npm start` in `backend`: restarted the inventory API with Stage 2 code,
  connected to the configured MongoDB and listened on port 5000.
- `npm run dev` in `frontend`: restarted Vite successfully on port 5500.
- `npm run build` in `frontend`: passed, bundling 66 modules. It emitted the
  React entry and all ten existing HTML page aliases with no build errors.
- `npm test` in `frontend`: **9 browser/API tests passed (1.6 minutes)** against
  the actual development application and MongoDB. All four stores were created
  and exercised through the UI, including product creation/editing, persistence,
  suppliers, stock transactions, sales, reports, charts, mobile navigation,
  login/logout and invalid tokens. Non-Clothing expired-sale restrictions and
  Clothing fashion filters were verified. No unexpected console/runtime errors
  or missing assets were reported by these flows.
- The API tests additionally verified an unselected retailer, stale session
  recovery, invalid store/fashion/date input, incompatible type changes,
  ignored Clothing expiry input, a test-owned legacy Clothing expiry date,
  unchanged stock after rejected operations, and cross-retailer isolation.
- The existing live AI request returned **`source: GEMINI`**. Its service was
  not modified; this was a regression check of the existing workflow.
- `npm run preview`: served the production bundle on port 5500. Headless Chrome
  verified all four shop choices, selected Clothing, opened the actual product
  form and confirmed no expiry input. Desktop and mobile screenshots were
  inspected. Mobile modal scrolling exposes the fashion selector and Save button
  without horizontal overflow; the production smoke check had no runtime errors.
- `node --check` on all **27 backend JavaScript files**: passed.
- Document fingerprints verified all **14 pre-existing records unchanged**.
  Final collection counts match the audit: 4 users, 3 products, 1 supplier,
  2 sales and 4 stock transactions. All temporary verification accounts were
  removed. No database migration or reset was performed.
- SHA-256 checks confirmed the backend environment, database configuration,
  Gemini service, both dependency lockfiles and all three existing CSS files
  unchanged. CycleJournal's Git working tree remains clean.

The development server is restored on port 5500 after the production check.
There is no unresolved build, runtime, API or data-migration blocker from these
checks. The Gemini expiry-warning/forecasting stage remains deferred.
