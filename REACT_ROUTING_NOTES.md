# React runtime, routes and original frontend audit

Project: `C:\Users\Dell\OneDrive\Desktop\SIM_P2`. All application commands and
changes were confined to this project. No CycleJournal files were inspected or
modified during this task. No backend, environment, dependencies, API contracts,
store rules, inventory calculations or Gemini implementation were changed.

## What actually ran before this correction

React was already installed and active. `frontend/index.html` mounted
`frontend/src/main.jsx`, which used `ReactDOM.createRoot`, BrowserRouter,
SessionProvider, ToastProvider and App. App routed the existing JSX pages.
Before edits, a real Chrome visit to `/register.html` proved that `#root` had
React's `__reactContainer$` property, the email input had a React `onChange`
handler, and network requests loaded `/src/main.jsx` and `/src/pages/Auth.jsx`.
No old `/js/auth.js`, `/js/common.js` or `/js/config.js` loaded. The URL alone
did not establish that the old standalone frontend was executing.

The actual deficiencies were `.html` canonical URLs, shared auth source with no
explicit Register/Login page files, eleven generated HTML aliases, and loose
original-source snapshots. These were corrected while retaining the already
working React page implementations and their business rules.

## Current source and routing

- Entry: `frontend/index.html` -> `src/main.jsx` -> `src/App.jsx`.
- Router: React Router BrowserRouter, eleven canonical routes below.
- Authentication: explicit `pages/Register.jsx` and `pages/Login.jsx` share
  `components/AuthForm.jsx`. useState controls all fields and error state;
  useSubmission controls loading and duplicate prevention. Native required,
  email and minimum-length validation precede the password-match check.
- Submission: existing API client POSTs JSON to `/api/auth/register` or login,
  saves the backend session through SessionProvider and uses React navigation.
  Registration goes to `/shop-selection`; login goes to shop selection or the
  dashboard according to the actual backend retailer. Errors remain visible.
- Data: `src/api.js`, `apiContract.js`, `storage.js`, `session.jsx`,
  `hooks/useResource.js` and `hooks/useSubmission.js`.
- UI: reusable Layout, Modal, Chart, Toast, UI and ExpiryAlerts components.
- CSS: all three original active files in `frontend/css` remain unchanged;
  main.jsx imports them plus the existing React integration `src/styles.css`.
- Output: only `frontend/dist/index.html` and hashed JS/CSS assets.

`src/routes.js` maps all eleven old URLs to clean routes. Vite dev and preview
return HTTP 308 and retain the query string. Browser tests prove fragment
preservation too. App also has React Navigate redirects with `replace`, search
and hash preservation for static hosts that serve the SPA entry. Application
links, session navigation and tests use canonical clean routes.

A separate static deployment must serve real assets normally and rewrite other
application paths to `index.html`. Optional host rules can perform the old-URL
HTTP redirects. Vite's middleware does not configure an external host. Direct
entry and refresh were verified with both the real dev and production preview
servers; no external deployment was requested or performed.

## Page-by-page map

Old files listed here refer to the original implementation inspected before
cleanup. Their complete bytes remain inside `legacy/frontend-original.zip`.
Every old URL now redirects; none requires a standalone page file.

| Old HTML | Canonical route | JSX in `frontend/src/pages` | Old JS behavior replaced | Existing API consumed | Verification |
|---|---|---|---|---|---|
| index.html | `/` | Landing.jsx | Links/entry navigation; no page script | None | Public UI, entry, reload, old URL |
| register.html | `/register` | Register.jsx + AuthForm | auth.js controlled registration, match validation, loading/error/session | POST auth/register | Desktop/mobile validation, 201, duplicate rejection, navigation, runtime proof |
| login.html | `/login` | Login.jsx + AuthForm | auth.js controlled login, loading/error/session | POST auth/login | Desktop/mobile login, wrong password, 200, logout, reload, runtime proof |
| shop-selection.html | `/shop-selection` | ShopSelection.jsx | shop.js four choices, saved shop name/type, unselected guard | GET/PUT auth/shop-type | All four store selections, mandatory selection, ownership, reload |
| dashboard.html | `/dashboard` | Dashboard.jsx + ExpiryAlerts | dashboard.js cards/chart/activity; preserved implemented expiry warning UI | reports/dashboard (includes recent sales), ai/expiry-alerts, PATCH dismiss | All stores, real data, mobile, warnings/dismiss/reload |
| products.html | `/products` | Products.jsx | products.js list/search, create/edit/delete, category/supplier/stock/expiry | products GET/POST/PUT id/DELETE id, suppliers GET | CRUD/search, validation, expiry versus fashion, all-store forms/mobile |
| suppliers.html | `/suppliers` | Suppliers.jsx | suppliers.js list/search/create/edit/delete | suppliers GET/POST/PUT id/DELETE id | CRUD, owner isolation, referenced-product cleanup |
| inventory.html | `/inventory` | Inventory.jsx | inventory.js stock-in/out forms and history | products GET, inventory/stock-in, stock-out, transactions | Real stock/history, rejection, concurrent/atomic writes, mobile |
| sales.html | `/sales` | Sales.jsx | sales.js product selection, total calculation, sale and history | products GET, sales GET/POST | Stock reduction, totals, expiry/insufficient-stock rejection, mobile |
| reports.html | `/reports` | Reports.jsx | reports.js aggregates/charts/low-stock/expiry | reports/daily, weekly, monthly, inventory, low-stock, expiry | Actual aggregates, two charts, Clothing expiry exclusion, mobile |
| ai-recommendations.html | `/ai-recommendations` | AIRecommendations.jsx | ai.js explicit generation, recommendations/source/fallback display | GET ai/reorder-suggestions | Empty/data results, safe fallback, Clothing exclusion, ownership |

Shared old `common.js` behavior became API, storage, session, toast, modal and
chart modules; `config.js` became config.js and the public API base setting.
No giant imperative DOM script is attached or copied into a page effect.
All non-auth workspace pages remain protected, with shop selection enforced
before entering the store layout. Dashboard expiry warnings remain components,
not an invented extra page. CSS is shared style.css, auth.css and dashboard.css
as appropriate, plus existing integration styles. No redesign was introduced.

## Safe cleanup and counts

Initial loose HTML count: **23 project files**, plus **7 installed dependency
HTML files**, or 30 including vendors. Project files were one source entry,
eleven generated entries and eleven original archived pages. Initial JSX: 19;
TSX: zero. React dependencies were already present; installation was unnecessary.

Before deleting original loose files: the full frontend suite was run against
the changed application; all canonical pages, old URL redirects and complete
store workflows were exercised. Repository-wide searches excluded vendors and
generated evidence and found no active legacy imports, static backend serving,
route dependency or test dependency. Only historical documentation referred to
the snapshot. Express remains API-only. Vite build proved no legacy dependency.

The 25 original files (11 HTML, 11 JS, 3 CSS) were packed into
`legacy/frontend-original.zip`. Each ZIP entry's SHA-256 was compared with the
pre-change original file hash before individual file deletion. This preserves
recovery despite this directory not being a Git repository. No bulk HTML glob,
recursive directory deletion or source overwrite was used.

Removed loose HTML: **21** (10 obsolete generated aliases through Vite's build
cleanup; 11 original archived standalone pages after verification). Retained
project HTML: **2**, source bootstrap `frontend/index.html` and generated
production bootstrap `frontend/dist/index.html`. Seven vendor HTML files remain
untouched. Eleven obsolete standalone JS and three duplicate archived CSS files
were removed; the active original CSS and all backend JS remain intact.

New source paths: `pages/Register.jsx`, `pages/Login.jsx`,
`components/AuthForm.jsx` (shared form moved from pages/Auth.jsx), and
`src/routes.js`. There are 21 JSX files, all reachable by the active application.
No standalone register.html implementation remains loose in the project.
The original exists only in the non-runtime recovery ZIP.

The earlier blocked removal of the empty `frontend/js` directory was not retried.
It has no files or runtime references and does not affect React.

## Executed verification

Actual results, with no backend implementation changes:

| Command/check | Result |
|---|---|
| `frontend: npm ls --depth=0` | React 18.3.1, React DOM 18.3.1, React Router 7.18.4, Vite 6.4.4 installed; no missing/extraneous dependencies |
| `backend: npm ls --depth=0` | Existing Express/Mongoose/Gemini dependencies valid |
| `frontend: npm run dev` | Real Vite server on localhost:5500, React entry executed |
| `frontend: npm run build` | Passed after routing and again after cleanup; 72 transformed modules, one HTML entry, hashed JS/CSS |
| `npm test -- --grep 'public pages\|existing authenticated inventory journey'` | Five focused tests passed after auth/routing batch |
| `npm test -- tests/react-routing.spec.js` | Three new runtime/redirect/auth tests passed |
| `frontend: npm test` against dev | 30/30 passed, 2.2 minutes |
| `backend: npm test` | 48/48 passed before and after cleanup |
| `frontend: npm run preview` | Port 5500; verified hashed production JS rather than /src/main.jsx or /@vite/client before testing |
| `frontend: npm test` against preview | 30/30 passed, 1.9 minutes |
| `node --check` for each first-party JS | 49 files passed; JSX checked by the real Vite build |
| Backend/original CSS/env/package SHA-256 comparison | All 44 protected files unchanged |
| Recovery ZIP comparison | 25/25 entry hashes matched originals |
| Source/production bundle secret scan | Zero matches for configured Gemini/JWT/database secrets across 32 files |
| Database document comparison after both full runs | All 20 original documents unchanged; zero temporary records remaining |

The initial inline syntax-check harness hit a PowerShell quoting error before
checking source; the corrected per-file `node --check` loop passed all 49 files.
No application fix was needed for that harness error.

Browser verification uses actual Chrome, Express API and MongoDB, with exact
UUID account teardown; network/error/provider-failure fixtures are explicitly
injected tests. Tests assert real React root/input handlers and entry/bundle
requests, all eleven direct entries and reloads, all eleven HTTP 308 redirects,
fragment/query preservation, and the static-host React redirect fallback.

At 390x844, registration/login, dashboard, all-store product forms (including
Clothing fashion), inventory, sales, reports, expiry dismissal and navigation
passed. Horizontal overflow and keyboard focus/inert modal behavior were
checked. Fresh registration, Clothing form and expiry screenshots were also
inspected visually in `frontend/test-results`.

Live Gemini expiry results remained `UNAVAILABLE` / `APPLICATION`; manual
results used `RULE_BASED`. Existing HTTP 429 cooldown was preserved and no
backend restart was used to evade it. Injected timeout, invalid-response and
429 tests verify fallback; they are not evidence of live provider success.
No Gemini implementation or credentials were changed.

Final MongoDB counts equal the baseline: users 5, products 4, suppliers 2,
sales 3, stocktransactions 6, expiryalerts 0. Every raw document SHA-256 matched,
not merely collection totals. The temporary comparison JSON was removed after
verification. This project remains independent of CycleJournal.

After restoring `npm run dev`, a final Chrome probe returned HTTP 200 at
`/register?source=bookmark#form`, reached through the old URL's HTTP 308.
The React root and controlled email handler were present; network requests
loaded main.jsx, pages/Register.jsx and components/AuthForm.jsx. No old page
scripts or runtime errors were observed. `/` rendered its landing component,
and `/api/health` returned `ok` for Shop Inventory Manager API. The dev server
was left running on port 5500 with the existing API on port 5000.
