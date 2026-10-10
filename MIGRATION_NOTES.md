# Stage 1 migration audit and decisions

Current routes and archive paths are documented in
[REACT_ROUTING_NOTES.md](REACT_ROUTING_NOTES.md). The `.html` routes and loose
`legacy/frontend` paths below describe the earlier stage, not today's runtime.

This is the historical Stage 1 record. Stage 2's store-type implementation and
verification are documented in [STORE_TYPE_NOTES.md](STORE_TYPE_NOTES.md).

## Identified source

Working project: `C:\Users\Dell\OneDrive\Desktop\SIM_P2`.
The previous workspace, `C:\Users\Dell\OneDrive\Desktop\CycleJournal`, is a
separate React/Flask cycle journal and was not changed during this migration.

Inspected archive: `C:\Users\Dell\Downloads\Shop-Inventory-Manager-Prompt-4-Gemini.zip`.
Its project root is `SIM_P2/`. The exact filename with `(1)` supplied in the
identification request was not found in the searched user directories.
The archive was inspected directly without extraction or overwriting a project.

Comparison of its 53 files with the working copy, ignoring CRLF/LF differences:
48 matched, four differed, and `backend/.env.example` was absent locally.
The differing files were `frontend/index.html`, `backend/config/db.js`,
`backend/controllers/reportController.js`, and `backend/services/geminiService.js`.
The working backend already has connection timeouts/reconnection logging and
Gemini retries. Its Gemini default is `gemini-3.8-flash`; the archive's is
`gemini-2.5-flash`. `GEMINI_MODEL` can override either. These existing local
changes were preserved; the archive was not used to reset the working copy.

Earlier Prompt 1/2/3 inventory archives and extracted directories also exist in
Downloads. The inspected Prompt 3 copy lacks the Prompt 4 Gemini controller,
route and service. `Desktop\Project1\SmartStock` is another frontend using
localStorage inventory and a message that Gemini will be connected later.
Neither was used as the migration target.

## Inspected implementation

All 11 frontend HTML files, 11 frontend JavaScript files and three CSS files;
the backend server, dependency manifest, installed dependency list, five
Mongoose schemas, seven controllers/routes, middleware, validators, database
configuration and Gemini service were inspected. Environment variable presence
was checked without printing secrets. There are no SQL schemas, database dumps,
frontend package scripts, or backend build/test scripts in the original source.
The backend's original scripts are `start` and `dev`.

## Route and API dependency map

React keeps the existing page URLs rather than inventing a new user journey.

| Existing URL | React page | Existing API calls |
| --- | --- | --- |
| `/`, `/index.html` | Landing | None |
| `/login.html` | Auth | POST `/auth/login` |
| `/register.html` | Auth | POST `/auth/register` |
| `/shop-selection.html` | ShopSelection | PUT `/auth/shop-type` |
| `/dashboard.html` | Dashboard | GET `/reports/dashboard` |
| `/products.html` | Products | GET/POST `/products`, PUT/DELETE `/products/:id`, GET `/suppliers` |
| `/suppliers.html` | Suppliers | GET/POST `/suppliers`, PUT/DELETE `/suppliers/:id` |
| `/inventory.html` | Inventory | GET `/products`, GET `/inventory/transactions`, POST `/inventory/stock-in`, POST `/inventory/stock-out` |
| `/sales.html` | Sales | GET `/products`, GET/POST `/sales` |
| `/reports.html` | Reports | GET `/reports/daily`, `/reports/weekly`, `/reports/monthly`, `/reports/inventory`, `/reports/low-stock`, `/reports/expiry` |
| `/ai-recommendations.html` | AIRecommendations | GET `/ai/reorder-suggestions` on Generate/Refresh |

Paths above are relative to the existing `/api` prefix. Other backend APIs such
as GET `/products/:id`, GET `/suppliers/:id`, and `/api/health` remain available.
The frontend does not add API contracts or change request/response formats.

## Actual store and product behavior preserved

- Stores: only `GROCERY` and `MEDICAL`, validated in both models and controllers.
  Shop selection stores an optional shop name on the authenticated user.
  This is a user-level shop type, not a multiple-shop management system.
- Authentication: JWT Bearer headers, six-character minimum passwords, password
  confirmation on registration, existing localStorage keys (`token`, `user`,
  `shopType`, `shopName`), local logout, and logout on API 401. Registration
  goes to shop selection; login goes there if the user has no selected shop.
- Categories remain the existing Grocery and Medical lists in `src/config.js`.
- Product fields: name, SKU, category, description, purchase/selling prices,
  quantity, minimum stock, supplier and optional expiry date. No new fields.
  SKU is uppercase and unique per owner in the backend. Numbers remain
  nonnegative; original HTML numeric constraints are retained.
- Product search by name/SKU, category filtering, stock badges, add/edit/delete
  modals, and delete confirmation remain available.
- Supplier CRUD and name/company search remain. Deleting a supplier detaches
  it from the owner's products, as the original backend specifies.
- Stock IN/OUT updates quantity and records transactions. Insufficient stock
  is rejected. Existing rollback behavior on transaction-record failure remains.
- Sales decrement stock, record the sale and a STOCK_OUT transaction, and
  reject expired products or insufficient stock. The existing price-times-
  quantity total calculation and backend rounding are retained.
- Dashboard cards, recent sales/activity, Chart.js line/bar/doughnut charts,
  INR formatting and `en-IN` date formatting remain.
- Reports remain daily/weekly/monthly sales, inventory valuation, low stock,
  expired products, and products expiring within **30 days**, not two days.
- Stock/sale lists retain the server's existing result limits. Deleting a product
  does not erase historical sales/transactions; their deleted-product labels
  remain visible.
- Existing CSS/theme/responsive breakpoints are reused. Inline landing and
  shop-selection styling was moved to `src/styles.css`.

## Existing Gemini behavior preserved

The protected AI endpoint reads the owner's products and last 30 days of sales.
It calculates daily average sales, frequency, and recent demand trends from
those records and passes them to the backend Gemini service. The service uses
`@google/genai` with a backend-only key, a JSON schema, and temperature 0.2.
Recommendations include product name, stock, average daily sales, reorder
quantity, urgency, reason, and demand observation. Validation discards unknown,
duplicate and expired products and invalid quantities/urgencies/reasons.
The service advises only; it never changes inventory.

The local service retries temporary 503/UNAVAILABLE/high-demand errors up to
three attempts. Errors or missing configuration return an explicitly labelled
rule-based fallback. That existing fallback considers minimum stock and days
of sales coverage and excludes expired products. The UI exposes the actual
`GEMINI`, `RULE_BASED` or `NO_DATA` result source. Generation remains manual.
There is no implemented scheduled notification or two-day expiry engine.

## Foundation and migration risks

React 18 + Vite was chosen because the original frontend is static HTML with
no build tooling; the existing Express backend remains independent. React
Router handles the existing pages and protected layout. Vite rewrites existing
HTML page requests during development and emits matching entry files at build
time so static deployments also retain bookmarks and page-refresh behavior.

Reusable components cover layout/navigation, labelled fields, modals, tables,
summary cards, Chart.js lifecycle, errors and timed toasts. A session provider
preserves storage behavior; `src/api.js` centralizes the existing API contract.
`useResource` manages loading/errors and prevents stale request results from
updating a page after it has unmounted. React text rendering avoids the old
string-template HTML insertion. No design system was introduced.

Risks addressed: reliance on browser-global element IDs, duplicate DOM handlers,
chart cleanup on navigation, request races, expired tokens, legacy HTML URLs,
missing static assets, and secrets accidentally entering frontend config.
API errors remain visible, including errors returned by the original backend.

The original frontend was copied byte-for-byte to `legacy/frontend` before
replacing the entry point. Obsolete active HTML/JavaScript is removed only after
the corresponding React routes pass browser verification. Existing CSS remains
in `frontend/css` and is imported by React.

Small assumptions: unknown URLs return to the existing landing page; accessible
form labels, keyboard modal controls and loading indicators support the same
existing actions. The historical UTC-based default date for stock/sales forms
is preserved rather than introducing a new timezone rule.

## Deferred work

Restaurant and Clothing stores, clothing attributes/old-fashion/new-fashion
organization, mandatory store-specific expiry rules, Gemini two-day expiry
notifications and new forecasting workflows are deliberately not implemented.
They require later stages rather than invented Stage 1 business rules.

## Verification approach

`npm run build` compiles the frontend; `npm start` runs the existing backend;
`npm run dev` runs Vite. `npm test` uses headless Chrome and actual authenticated
API requests/MongoDB records to check public/protected routes, both store flows,
CRUD, stock/sales validation, reports/charts, Gemini source handling, mobile
navigation, direct-page refresh, logout/login, expired tokens and console/assets.
Unique temporary test accounts and their owned records are cleaned in teardown.
See the final verification record below for actual results.

## Final verification record

- `npm install --no-audit --no-fund` in `frontend`: succeeded, with 75 packages
  installed. The installer mentioned the esbuild install script; the subsequent
  builds succeeded without a missing-binary error.
- `npm start` in `backend`: started the original server, connected to the
  configured MongoDB, and responded to `/api/health` with the inventory service
  identity. No backend source or environment configuration was changed.
- `npm run dev` in `frontend`: started Vite. The first browser run exposed the
  original backend's CORS restriction to port 5500. Vite dev/preview now both use
  that original frontend port; no backend/API compatibility change was needed.
- `npm run build`: succeeded again after obsolete active HTML/JavaScript was
  removed. Output includes `index.html`, ten page HTML aliases, bundled CSS and
  JavaScript. Every alias is byte-identical to the built React entry HTML.
- `npm test` against the final development server: **3 passed (40.3 seconds)**.
- `npm run preview`: served the production build on port 5500.
- `npm test` against that production preview: **3 passed (33.4 seconds)**.
- Both successful suites exercised a live Gemini generation and received
  `source: GEMINI`; empty inventories returned `NO_DATA`. The existing fallback
  remains preserved in backend code; no forced Gemini failure was introduced.
- Tests verified Grocery/Medical registration and selection, supplier and
  product add/edit/delete, SKU search, stock IN/OUT, insufficient-stock rejection,
  sales totals, rejected insufficient-stock sales, Medical expired-sale rejection,
  expiry/low-stock reports, charts, mobile navigation, page refresh, login/logout
  and invalid-token handling. No unexpected browser console errors, JavaScript
  runtime errors or missing assets were reported.
- Production desktop landing and mobile login screenshots were visually checked
  for the preserved theme and responsive layout.
- `node --check` on all 25 backend JavaScript files: passed. ZIP integrity
  inspection with Python `zipfile.testzip()`: passed.
- SHA-256 checks verified all 29 original backend/configuration files unchanged,
  all 25 original frontend files preserved in `legacy/frontend`, and all three
  active CSS files unchanged. CycleJournal's Git working tree remained clean.
- Verification accounts and their owned records were removed by test teardown;
  a database count check confirmed zero remaining verification accounts.

Stage 1 has no unresolved build, runtime or external-service blocker found in
these checks. Later store-type and expiry-alert stages remain deferred.
