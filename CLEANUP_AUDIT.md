# SIM_P2 repository cleanup audit

This is the earlier cleanup record. The subsequent user-authorized removal of
obsolete HTML/JS, verified ZIP backup and clean React routes are recorded in
[REACT_ROUTING_NOTES.md](REACT_ROUTING_NOTES.md). Earlier KEEP decisions for
HTML aliases and loose archived source below have been superseded by that work.

Project: `C:\Users\Dell\OneDrive\Desktop\SIM_P2`.

Initial file-by-file inventory: **130 project files**, plus **7 installed dependency HTML files** inspected (**137 total**). All 30 HTML files were read. Other installed dependency files are vendor-managed; package manifests/locks and `npm ls --depth=0` were checked rather than deleting library internals. No TypeScript/TSX, extra public image assets, deployment configuration, or Git repository was found. Six PNG files are generated browser evidence, not application images.

Each project text file was read and dependency/asset references extracted. Binary evidence was identified by format/path/hash and inspected visually during verification. Active static imports reach all 31 backend runtime JS files and all 25 React source modules plus four CSS files. Three backend test modules are reached through the test script; five frontend test/fixture modules and both frontend configurations are test/build entry points. No unresolved active relative imports or dead runtime modules were found.

## Recorded before deletion

| Exact path | Decision | Evidence |
|---|---|---|
| `backend/services.tmp` | OBSOLETE | Empty and unreferenced; backend uses `services/geminiService.js` and `services/expiryAlertService.js`, not this file. |
| `frontend/js/` (empty directory) | OBSOLETE | No files, imports, script tags or configured asset paths use it; React source is in `frontend/src`, and the original scripts remain under the documented archive. |

Only these two entries are eligible for cleanup: **one file and one empty directory**. Git status/repository checks reported that SIM_P2 is not a Git repository. No ambiguous source is removed.

Actual outcome: `backend/services.tmp` was deleted. Normal removal of the empty
OneDrive directory `frontend/js` failed with insufficient access; automatic
approval review rejected forced removal with the stated reason "blocked by policy".
The directory remains empty and unreferenced. Its status is proven OBSOLETE but
retained because removal was blocked, not NEEDS REVIEW.

## HTML decisions (every exact file)

The active router keeps `/`, `/index.html` and all ten page URLs. Vite rewrites those page URLs to the single source entry in development and emits matching HTML aliases for production. React Router alone does not create static entry files. Login/session/logout redirects, navigation links and actual browser tests use these `.html` URLs. Express is API-only: no HTML static server or backend page redirect was found.

`frontend/index.html` loads `/src/main.jsx`; all eleven built HTML files load the same hashed React JS/CSS assets. Each old archived page has its corresponding React route, but the archive is intentionally retained for reference/recovery, not used to serve any current route.

| Exact HTML path | Classification | Purpose and deletion consequence |
|---|---|---|
| `frontend/dist/ai-recommendations.html` | KEEP ? COMPATIBILITY | Generated entry for its existing .html route; direct static navigation needs this compatibility output. |
| `frontend/dist/dashboard.html` | KEEP ? COMPATIBILITY | Generated entry for its existing .html route; direct static navigation needs this compatibility output. |
| `frontend/dist/index.html` | KEEP | Built React entry for preview/static deployment. |
| `frontend/dist/inventory.html` | KEEP ? COMPATIBILITY | Generated entry for its existing .html route; direct static navigation needs this compatibility output. |
| `frontend/dist/login.html` | KEEP ? COMPATIBILITY | Generated entry for its existing .html route; direct static navigation needs this compatibility output. |
| `frontend/dist/products.html` | KEEP ? COMPATIBILITY | Generated entry for its existing .html route; direct static navigation needs this compatibility output. |
| `frontend/dist/register.html` | KEEP ? COMPATIBILITY | Generated entry for its existing .html route; direct static navigation needs this compatibility output. |
| `frontend/dist/reports.html` | KEEP ? COMPATIBILITY | Generated entry for its existing .html route; direct static navigation needs this compatibility output. |
| `frontend/dist/sales.html` | KEEP ? COMPATIBILITY | Generated entry for its existing .html route; direct static navigation needs this compatibility output. |
| `frontend/dist/shop-selection.html` | KEEP ? COMPATIBILITY | Generated entry for its existing .html route; direct static navigation needs this compatibility output. |
| `frontend/dist/suppliers.html` | KEEP ? COMPATIBILITY | Generated entry for its existing .html route; direct static navigation needs this compatibility output. |
| `frontend/index.html` | KEEP | Vite bootstrap; deleting breaks dev/build. |
| `legacy/frontend/ai-recommendations.html` | KEEP ? COMPATIBILITY | Original page in the documented rollback/reference set; React replaces runtime functionality, but deletion removes the intentional historical source. |
| `legacy/frontend/dashboard.html` | KEEP ? COMPATIBILITY | Original page in the documented rollback/reference set; React replaces runtime functionality, but deletion removes the intentional historical source. |
| `legacy/frontend/index.html` | KEEP ? COMPATIBILITY | Original page in the documented rollback/reference set; React replaces runtime functionality, but deletion removes the intentional historical source. |
| `legacy/frontend/inventory.html` | KEEP ? COMPATIBILITY | Original page in the documented rollback/reference set; React replaces runtime functionality, but deletion removes the intentional historical source. |
| `legacy/frontend/login.html` | KEEP ? COMPATIBILITY | Original page in the documented rollback/reference set; React replaces runtime functionality, but deletion removes the intentional historical source. |
| `legacy/frontend/products.html` | KEEP ? COMPATIBILITY | Original page in the documented rollback/reference set; React replaces runtime functionality, but deletion removes the intentional historical source. |
| `legacy/frontend/register.html` | KEEP ? COMPATIBILITY | Original page in the documented rollback/reference set; React replaces runtime functionality, but deletion removes the intentional historical source. |
| `legacy/frontend/reports.html` | KEEP ? COMPATIBILITY | Original page in the documented rollback/reference set; React replaces runtime functionality, but deletion removes the intentional historical source. |
| `legacy/frontend/sales.html` | KEEP ? COMPATIBILITY | Original page in the documented rollback/reference set; React replaces runtime functionality, but deletion removes the intentional historical source. |
| `legacy/frontend/shop-selection.html` | KEEP ? COMPATIBILITY | Original page in the documented rollback/reference set; React replaces runtime functionality, but deletion removes the intentional historical source. |
| `legacy/frontend/suppliers.html` | KEEP ? COMPATIBILITY | Original page in the documented rollback/reference set; React replaces runtime functionality, but deletion removes the intentional historical source. |
| `backend/node_modules/bignumber.js/doc/API.html` | KEEP ? COMPATIBILITY | Installed dependency API documentation; managed by npm, unrelated to application page migration. |
| `frontend/node_modules/playwright-core/lib/vite/dashboard/index.html` | KEEP ? COMPATIBILITY | Installed Playwright Playwright Dashboard interface; managed by npm, unrelated to application page migration. |
| `frontend/node_modules/playwright-core/lib/vite/htmlReport/index.html` | KEEP ? COMPATIBILITY | Installed Playwright Playwright Test Report interface; managed by npm, unrelated to application page migration. |
| `frontend/node_modules/playwright-core/lib/vite/recorder/index.html` | KEEP ? COMPATIBILITY | Installed Playwright Playwright Inspector interface; managed by npm, unrelated to application page migration. |
| `frontend/node_modules/playwright-core/lib/vite/traceViewer/index.html` | KEEP ? COMPATIBILITY | Installed Playwright Playwright Trace Viewer interface; managed by npm, unrelated to application page migration. |
| `frontend/node_modules/playwright-core/lib/vite/traceViewer/snapshot.html` | KEEP ? COMPATIBILITY | Installed Playwright snapshot interface; managed by npm, unrelated to application page migration. |
| `frontend/node_modules/playwright-core/lib/vite/traceViewer/uiMode.html` | KEEP ? COMPATIBILITY | Installed Playwright Playwright Test interface; managed by npm, unrelated to application page migration. |

## Complete initial project inventory

| Exact path | Type | Classification | Dependency/purpose evidence |
|---|---|---|---|
| `.gitignore` | configuration | KEEP | Excludes installed dependencies, build/test outputs and real environment secrets; permits safe example configuration. |
| `EXPIRY_ALERT_NOTES.md` | .md | KEEP | Useful setup or historical migration/store/expiry/hardening documentation. |
| `HARDENING_NOTES.md` | .md | KEEP | Useful setup or historical migration/store/expiry/hardening documentation. |
| `MIGRATION_NOTES.md` | .md | KEEP | Useful setup or historical migration/store/expiry/hardening documentation. |
| `README.md` | .md | KEEP | Useful setup or historical migration/store/expiry/hardening documentation. |
| `STORE_TYPE_NOTES.md` | .md | KEEP | Useful setup or historical migration/store/expiry/hardening documentation. |
| `backend/.env` | configuration | KEEP | Existing private backend configuration or safe example configuration; keys inspected without exposing values. |
| `backend/.env.example` | .example | KEEP | Existing private backend configuration or safe example configuration; keys inspected without exposing values. |
| `backend/config/db.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/controllers/aiController.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/controllers/authController.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/controllers/expiryAlertController.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/controllers/inventoryController.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/controllers/productController.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/controllers/reportController.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/controllers/saleController.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/controllers/supplierController.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/domain/expiryAlerts.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/domain/storeTypes.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/middleware/authMiddleware.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/middleware/errorMiddleware.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/models/ExpiryAlert.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/models/Product.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/models/Sale.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/models/StockTransaction.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/models/Supplier.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/models/User.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/package-lock.json` | .json | KEEP | Reproducible npm dependency graph corresponding to package manifest. |
| `backend/package.json` | .json | KEEP | Actual SIM_P2 scripts and declared runtime/test dependencies. |
| `backend/routes/aiRoutes.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/routes/authRoutes.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/routes/inventoryRoutes.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/routes/productRoutes.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/routes/reportRoutes.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/routes/saleRoutes.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/routes/supplierRoutes.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/server.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/services.tmp` | .tmp | OBSOLETE | Empty (0 bytes); no pre-existing code/config/test/doc reference; not loaded by server or scripts. |
| `backend/services/expiryAlertService.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/services/geminiService.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/tests/expiryAlerts.test.js` | .js | KEEP | Executed by node --test/Playwright or imported shared fixture; exact-owner cleanup and regression coverage. |
| `backend/tests/hardening.test.js` | .js | KEEP | Executed by node --test/Playwright or imported shared fixture; exact-owner cleanup and regression coverage. |
| `backend/tests/storeTypes.test.js` | .js | KEEP | Executed by node --test/Playwright or imported shared fixture; exact-owner cleanup and regression coverage. |
| `backend/utils/stockWrite.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `backend/utils/validators.js` | .js | KEEP | Reachable from server.js through routes/controllers/models/services/domain/middleware/config/utils import graph. |
| `frontend/.env.example` | .example | KEEP | Existing private backend configuration or safe example configuration; keys inspected without exposing values. |
| `frontend/css/auth.css` | .css | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/css/dashboard.css` | .css | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/css/style.css` | .css | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/dist/ai-recommendations.html` | .html | KEEP ? COMPATIBILITY | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/assets/index-CLTEzFDC.css` | .css | KEEP | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/assets/index-kQqRkD75.js` | .js | KEEP | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/dashboard.html` | .html | KEEP ? COMPATIBILITY | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/index.html` | .html | KEEP | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/inventory.html` | .html | KEEP ? COMPATIBILITY | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/login.html` | .html | KEEP ? COMPATIBILITY | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/products.html` | .html | KEEP ? COMPATIBILITY | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/register.html` | .html | KEEP ? COMPATIBILITY | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/reports.html` | .html | KEEP ? COMPATIBILITY | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/sales.html` | .html | KEEP ? COMPATIBILITY | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/shop-selection.html` | .html | KEEP ? COMPATIBILITY | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/dist/suppliers.html` | .html | KEEP ? COMPATIBILITY | Generated production output referenced by emitted HTML/preview; rebuilt by Vite, not a parallel legacy implementation. |
| `frontend/index.html` | .html | KEEP | Vite source entry: root mount and /src/main.jsx; required to bootstrap React. |
| `frontend/package-lock.json` | .json | KEEP | Reproducible npm dependency graph corresponding to package manifest. |
| `frontend/package.json` | .json | KEEP | Actual SIM_P2 scripts and declared runtime/test dependencies. |
| `frontend/playwright.config.js` | .js | KEEP | Browser test runner, actual API/dev server configuration. |
| `frontend/src/App.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/api.js` | .js | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/apiContract.js` | .js | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/components/Chart.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/components/ExpiryAlerts.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/components/Layout.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/components/Modal.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/components/Toast.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/components/UI.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/config.js` | .js | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/hooks/useResource.js` | .js | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/hooks/useSubmission.js` | .js | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/main.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/pages/AIRecommendations.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/pages/Auth.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/pages/Dashboard.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/pages/Inventory.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/pages/Landing.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/pages/Products.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/pages/Reports.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/pages/Sales.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/pages/ShopSelection.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/pages/Suppliers.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/session.jsx` | .jsx | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/storage.js` | .js | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/src/styles.css` | .css | KEEP | Reachable from main.jsx/App.jsx React module graph or direct CSS imports; no dead module found. |
| `frontend/test-results/.last-run.json` | .json | KEEP | Ignored, reproducible evidence from the latest verified suite; tests emit these exact paths. Refreshed by this cleanup verification. |
| `frontend/test-results/stage3-expiry-desktop.png` | .png | KEEP | Ignored, reproducible evidence from the latest verified suite; tests emit these exact paths. Refreshed by this cleanup verification. |
| `frontend/test-results/stage3-expiry-mobile.png` | .png | KEEP | Ignored, reproducible evidence from the latest verified suite; tests emit these exact paths. Refreshed by this cleanup verification. |
| `frontend/test-results/stage4-clothing-mobile-form.png` | .png | KEEP | Ignored, reproducible evidence from the latest verified suite; tests emit these exact paths. Refreshed by this cleanup verification. |
| `frontend/test-results/stage4-grocery-mobile-form.png` | .png | KEEP | Ignored, reproducible evidence from the latest verified suite; tests emit these exact paths. Refreshed by this cleanup verification. |
| `frontend/test-results/stage4-medical-mobile-form.png` | .png | KEEP | Ignored, reproducible evidence from the latest verified suite; tests emit these exact paths. Refreshed by this cleanup verification. |
| `frontend/test-results/stage4-restaurant-mobile-form.png` | .png | KEEP | Ignored, reproducible evidence from the latest verified suite; tests emit these exact paths. Refreshed by this cleanup verification. |
| `frontend/tests/expiry-alerts.spec.js` | .js | KEEP | Executed by node --test/Playwright or imported shared fixture; exact-owner cleanup and regression coverage. |
| `frontend/tests/fixtures.js` | .js | KEEP | Executed by node --test/Playwright or imported shared fixture; exact-owner cleanup and regression coverage. |
| `frontend/tests/hardening.spec.js` | .js | KEEP | Executed by node --test/Playwright or imported shared fixture; exact-owner cleanup and regression coverage. |
| `frontend/tests/migration.spec.js` | .js | KEEP | Executed by node --test/Playwright or imported shared fixture; exact-owner cleanup and regression coverage. |
| `frontend/tests/store-types.spec.js` | .js | KEEP | Executed by node --test/Playwright or imported shared fixture; exact-owner cleanup and regression coverage. |
| `frontend/vite.config.js` | .js | KEEP | React build, strict ports, dev .html rewrites and production ten-page aliases. |
| `legacy/frontend/ai-recommendations.html` | .html | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/css/auth.css` | .css | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/css/dashboard.css` | .css | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/css/style.css` | .css | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/dashboard.html` | .html | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/index.html` | .html | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/inventory.html` | .html | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/js/ai.js` | .js | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/js/auth.js` | .js | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/js/common.js` | .js | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/js/config.js` | .js | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/js/dashboard.js` | .js | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/js/inventory.js` | .js | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/js/products.js` | .js | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/js/reports.js` | .js | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/js/sales.js` | .js | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/js/shop.js` | .js | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/js/suppliers.js` | .js | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/login.html` | .html | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/products.html` | .html | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/register.html` | .html | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/reports.html` | .html | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/sales.html` | .html | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/shop-selection.html` | .html | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |
| `legacy/frontend/suppliers.html` | .html | KEEP ? COMPATIBILITY | Documented 25-file original-source reference/rollback archive; internal HTML/JS/CSS links are intact; outside active Vite/Express runtime. |

## Duplicate and retention decisions

- The three `frontend/css/*.css` files match the three archived CSS files byte for byte. The active copies are directly imported by React; the archived copies keep the original source snapshot intact. Both have proven distinct purposes.
- All eleven `frontend/dist/*.html` files are byte-identical wrappers for one React bundle. Their distinct URLs are intentional compatibility outputs generated by `vite.config.js`, not duplicate application implementations.
- All 25 `legacy/frontend` files are documented in README/migration notes as retained original source. No Git recovery is available, so the archive remains intact. It is not loaded by the active frontend/backend.
- No obsolete active JS/CSS/config file or duplicated React module was found. All runtime modules are reachable. Package locks, environment examples, tests and useful stage notes remain. Historical former-workspace prose is intentional; active code/config has no dependency on it.
- Latest screenshots and `.last-run.json` are ignored, generated verification outputs with explicit test producers, not stale source files. They are refreshed by the verification run and retained as evidence.
- No entry was classified NEEDS REVIEW. Archive and vendor files are retained for proven purposes, not treated as ambiguous cleanup candidates.

## Post-cleanup verification

- `npm ls --depth=0` in both packages: declared dependencies present, no extraneous
  dependency entries. `npm audit` in each package: zero vulnerabilities.
- Backend `npm test`: **48 passed**, zero failures.
- Frontend `npm run build`: **passed, 69 modules**; the same React JS/CSS bundle
  and index plus ten page aliases were emitted.
- Full frontend `npm test` against development: **27 passed (2.0 minutes)**.
- `npm run preview`, independently checked to serve built assets rather than the
  development client, followed by the complete suite: **27 passed (1.7 minutes)**.
- `node --check`: **47 active JavaScript files passed**, including backend,
  frontend source/tests and Vite/Playwright configuration; the build validates JSX.
- Independent headless Chrome checks: all **12 direct URLs and 12 reloads passed
  in development**, and the same **12 direct URLs and 12 reloads passed in production**.
  Routes were `/`, `/index.html`, `/login.html`, `/register.html`,
  `/shop-selection.html`, `/dashboard.html`, `/products.html`, `/suppliers.html`,
  `/inventory.html`, `/sales.html`, `/reports.html`, `/ai-recommendations.html`.
  Authenticated protected pages restored their actual selected retailer; page
  headings/URLs remained correct. Zero runtime/missing-asset errors in those checks.
- Complete suites exercised authentication/session/logout, all four store types,
  product/supplier CRUD, validation, Clothing Old/New Fashion and no expiry,
  stock/sales integrity, reports, expiry eligibility/creation/display/dismissal/
  persistence, ownership isolation, malformed responses and provider fallbacks.
  All four mobile journeys passed keyboard navigation, modal behavior and overflow
  checks. All six fresh desktop/mobile evidence screenshots were inspected visually.
- No application code, business logic, route, store type, Gemini behavior or
  database schema was changed. Hash comparison confirmed **108 preserved source,
  configuration and archive files unchanged**, including environment/package files
  and all 25 archived original frontend files. README was deliberately updated to
  explain source versus generated files, and this audit was added.
- The database baseline for this cleanup was **20 records**, captured before
  verification. All **20 original raw-document fingerprints remained unchanged**;
  zero additional records remained. Counts: users 5, products 4, suppliers 2,
  sales 3, stocktransactions 6, expiryalerts 0. Verification created only exact
  temporary identities and cleaned only their owned records. No reset or migration.
- Gemini remained unavailable/rate-limited (HTTP 429). Actual warnings displayed
  application estimates, and manual recommendations used RULE_BASED fallback.
  Existing timeout/invalid-response/injected-provider-failure/429 regressions passed.
  No successful live Gemini response was fabricated or claimed.
- The existing SIM_P2 `npm start` backend was reused to preserve quota cooldown;
  no watch process was running. Production preview was stopped and frontend
  `npm run dev` restored on port 5500. Both API health and React development entry
  returned HTTP 200 in final checks. No command was run in another project directory.

Three temporary audit data files were created for the internal inventory/baseline
and removed after their contents were incorporated/verified. These are separate
from the one pre-existing obsolete file removed:

| Temporary file created by this task | Removal reason |
|---|---|
| `backend/tests/.cleanup-file-inventory.json` | Initial paths/hashes/references were incorporated into this permanent audit. |
| `backend/tests/.cleanup-vendor-html.json` | Seven vendor HTML decisions were incorporated into the HTML table. |
| `backend/tests/.cleanup-database-baseline.json` | Original record hashes were compared successfully; only preservation results need remain. |

Only explicitly named paths inside SIM_P2 were eligible for removal. No glob,
recursive mass deletion, source reset, Git commit or backup-archive deletion was used.
