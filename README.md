# SIM_P2 — Shop Inventory Manager

The React inventory application supports Medical, Restaurant, Grocery and
Clothing stores. Product and inventory views follow the retailer's selected
store type. Its existing Node/Express/MongoDB architecture and Gemini reorder
service are preserved. The project root is
`C:\Users\Dell\OneDrive\Desktop\SIM_P2`.

For separate local demo accounts, realistic sample history, expiry examples and
safe repeatable seeding/cleanup, see [DEMO_DATA_GUIDE.md](DEMO_DATA_GUIDE.md).
From `backend`, run `npm run seed:demo` explicitly; nothing seeds at startup.

Medical, Restaurant and Grocery owners receive persistent dashboard warnings
for expiry dates from today through two days ahead. The backend scans on startup
and every 15 minutes, independently of an open browser. Sales-based seven-day
replacement estimates include their evidence and limitations; the existing
server-side Gemini integration supplies validated explanations. Clothing is
excluded. Notifications and purchasing advice never change stock or place orders.

## Run

Use two terminals from this project root:

```powershell
Set-Location 'C:\Users\Dell\OneDrive\Desktop\SIM_P2\backend'
npm ci
npm start
```

```powershell
Set-Location 'C:\Users\Dell\OneDrive\Desktop\SIM_P2\frontend'
npm ci
npm run dev
```

Open http://localhost:5500. Application routes use `/register`, `/login`,
`/dashboard`, `/products`, `/inventory`, `/sales`, `/suppliers`, `/reports`,
`/shop-selection` and `/ai-recommendations`. Old `.html` bookmarks redirect to
these React routes, including on direct entry and refresh.

Keep the existing `backend/.env`. For a new installation, copy
`backend/.env.example` to `backend/.env` and supply your own database connection,
JWT secret and Gemini configuration. Stock/sales writes require a MongoDB replica
set or a transaction-capable sharded deployment; standalone MongoDB is unsupported.
The backend reads `backend/.env`: `MONGO_URI`, `JWT_SECRET`,
`PORT`, `CLIENT_ORIGIN`, `JWT_EXPIRES_IN`, `GEMINI_API_KEY`, and `GEMINI_MODEL`.
Do not copy these secrets into the frontend. Its only optional configuration
is the public `VITE_API_BASE_URL`, documented in `frontend/.env.example`.
The default backend API address remains http://localhost:5000/api.

## Build and verification

```powershell
cd frontend
npm run build
npm run preview
npm test
```

The frontend build emits one React entry, `dist/index.html`, plus JS/CSS bundles.
Preview runs on http://localhost:5500; dev runs on the same port. Ports are strict
to prevent an unnoticed switch away from the backend's configured origin.
Stop the dev server before starting preview; both use the original frontend's
port 5500 to match the existing backend `CLIENT_ORIGIN` configuration.
Use `npm start` for backend verification. Stop an existing backend watch process
before starting another API process; file synchronization can restart watch mode
and interrupt browser checks.

Browser tests use the actual API and MongoDB, never mocked inventory responses.
They create uniquely named verification accounts and temporary records, then
delete only their own account's records in teardown. They need the existing
backend `.env` and database permissions to perform those operations. On Windows
they use installed Google Chrome; elsewhere install Playwright Chromium with
`npx playwright install chromium`, or set `PLAYWRIGHT_CHANNEL` to an installed
supported browser. The tests start the existing backend and Vite scripts when
these servers are not already running.

Backend schema tests do not require a database connection:

```powershell
cd backend
npm test
```

Medical, Restaurant and Grocery products retain optional expiry dates and
existing expired-sale restrictions. Clothing products have no expiry; they
require an Old Fashion or New Fashion classification. Their existing category
field remains available without adding a clothing or restaurant category taxonomy.

See [MIGRATION_NOTES.md](MIGRATION_NOTES.md) for the audit, route/API map,
preserved behavior, assumptions, and Stage 1 boundary. Current extensionless
routes, runtime proof and original-source archive are documented in
[REACT_ROUTING_NOTES.md](REACT_ROUTING_NOTES.md).

See [STORE_TYPE_NOTES.md](STORE_TYPE_NOTES.md) for Stage 2's schema/API changes,
backward compatibility decisions, database inspection and observed verification.

See [EXPIRY_ALERT_NOTES.md](EXPIRY_ALERT_NOTES.md) for Stage 3's date semantics,
sales calculation, alert persistence, provider failure handling and verification.
No new environment variables, dependencies or external infrastructure are needed.

Stage 4 strengthens validation, retailer isolation, atomic stock/history writes,
API error handling, keyboard/mobile access and duplicate submission prevention.
The existing MongoDB replica set supports the transactions used for stock, sales
and supplier deletion. Backend development reload uses Node's built-in watch mode:
`npm run dev` (verified with Node 24.21.0). Nodemon's vulnerable dependency chain
has been removed; production still uses `npm start`.

See [HARDENING_NOTES.md](HARDENING_NOTES.md) for concrete defects, compatibility
decisions, executed tests, database preservation and remaining provider limits.
Its Stage 5 section records the final SIM_P2 verification. Historical stage notes
remain historical; current setup and runtime paths belong to SIM_P2.

## Source and generated files

Edit React pages/components in `frontend/src`. `frontend/index.html` is Vite's
single source entry, mounting `src/main.jsx`, `src/App.jsx` and React Router.
Registration and login have explicit `src/pages/Register.jsx` and `Login.jsx`
pages sharing the controlled form in `src/components/AuthForm.jsx`.
The sole generated HTML entry, `frontend/dist/index.html`, loads the production
React bundle. Rebuild it with `npm run build`; do not edit it manually.

For deployment to another static server, configure SPA fallback: serve real
assets normally and rewrite other application paths to `/index.html`.
Vite dev/preview return HTTP 308 for old `.html` URLs. On a static host with SPA
fallback, React Router provides the same redirects; optional host redirect rules
can return HTTP 308 before loading React. Without SPA fallback, direct clean
URLs and refreshes can return 404. No external deployment was performed.

`legacy/frontend-original.zip` preserves all 25 original frontend files with
verified SHA-256 hashes. It is outside the runtime. The obsolete loose HTML/JS
and duplicate CSS were removed only after their React replacements passed.
`frontend/test-results` contains ignored, reproducible browser-test evidence.
See [REACT_ROUTING_NOTES.md](REACT_ROUTING_NOTES.md) for the current page map and
[CLEANUP_AUDIT.md](CLEANUP_AUDIT.md) for the earlier audit.
