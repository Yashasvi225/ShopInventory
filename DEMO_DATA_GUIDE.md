# SIM_P2 local demo data

For the presentation accounts with separate strong passwords, encrypted Windows
credential storage and `demo.*@example.com` addresses, use [DEMO_LOGIN_GUIDE.md](DEMO_LOGIN_GUIDE.md).
The older `local` dataset described below remains separate and is preserved.

Project: `C:\Users\Dell\OneDrive\Desktop\SIM_P2`.
This explicitly invoked feature adds synthetic inventory/history for four separate
retailers. It never runs on application startup and refuses `NODE_ENV=production`.
Existing models, authentication, routes, CSS and prediction formulas are unchanged.

## Load the dataset

Stop the backend while seeding to avoid its background scanner competing with
initial local estimate preparation. From the project root:

```powershell
cd backend
npm run seed:demo
npm start
```

The command uses the existing `backend/.env` MongoDB connection. No new API key
is needed. MongoDB must support transactions, as the existing stock/sales APIs
already require. No dependency installation is needed if the app already runs.

The first seed creates a manifest in `demodatasets` with the exact generated
record IDs. Accounts, products, suppliers, sales and stock history commit in one
transaction. Alerts and their estimates are then prepared through the existing
expiry service. A repeated command validates the manifest and identities, creates
no duplicate inventory/history, preserves edits and dismissals, and never resets
passwords. It does not silently refill deleted records or move dates forward.
An email collision without a verified manifest stops the entire transaction.

## Local demo accounts

| Store | Email |
|---|---|
| Medical | `sim-demo-local-medical@example.invalid` |
| Restaurant | `sim-demo-local-restaurant@example.invalid` |
| Grocery | `sim-demo-local-grocery@example.invalid` |
| Clothing | `sim-demo-local-clothing@example.invalid` |

All four accounts share one randomly generated local demo password. Open
`backend/.demo-data.local.json` locally and copy its `password` value into the
existing Login form. The file is ignored by Git, never served by the API, and
the seed command never prints the password. Keep it private; never commit it or
use these accounts/passwords in production.

Optionally set `SIM_DEMO_PASSWORD` in the seed process before the first run.
New passwords must meet the current 8-character uppercase/lowercase/digit/punctuation
policy and the 72 UTF-8-byte bcrypt limit. Existing saved credentials are not silently changed.
Once the credential file exists, a conflicting override is refused. If the file
is lost, a new generated password cannot replace existing accounts: restore the
original credentials, or use verified demo cleanup and then seed again.

Accounts use the actual User schema's bcrypt hook and normal `/api/auth/login`.
No authentication bypass, public seed endpoint or relaxed store validation exists.
Each record's `createdBy` is its demo retailer, so real retailers cannot see it.
Names, SKUs, descriptions and suppliers identify the data as `[DEMO]`/`DEMO`.

## What is created

| Store | Products | Suppliers | Sales | Stock history | Expiry alerts |
|---|---:|---:|---:|---:|---:|
| Medical | 12 | 3 | 214 | 226 | 6 |
| Restaurant | 12 | 3 | 214 | 226 | 6 |
| Grocery | 12 | 3 | 214 | 226 | 6 |
| Clothing | 12 | 3 | 217 | 229 | 0 |

Also created: four users and one manifest. Alert counts include persisted events
even after dismissal. Each product has an opening STOCK_IN and matching STOCK_OUT
for every sale. Opening quantity minus sold quantity equals its displayed stock.
Sales totals use actual quantity times sellingPrice. Dates cover UTC days -29
through today; sales for expired batches always precede their expiry instant.

Medical examples: Paracetamol Tablets, Cough Syrup, Antacid Tablets, Vitamin
Supplements, Bandages, Antiseptic Solution, Oral Rehydration Salts, Digital
Thermometers, Cotton Rolls, Disposable Gloves, Saline Nasal Spray and an expired
First Aid Ointment batch.

Restaurant: Milk, Vegetables, Cheese, Bread, Fresh Sauce, Yogurt, Rice, Wheat
Flour, Spices, Cooking Oil, Tomato Sauce and an expired Cream batch. These use
the supported **product sales model** for demonstration; no recipe, ingredient
consumption or usage-prediction system has been invented.

Grocery: Milk, Packaged Snacks, Juice, Biscuits, Fresh Paneer, Yogurt, Rice,
Wheat Flour, Sugar, Detergent, Cooking Oil and an expired Fruit Drink batch.

Clothing: T-shirts, Jeans, Shirts, Dresses, Jackets, Trousers, Polo Shirts,
Sweatshirts, Scarves, Formal Shirts, Leggings and Shorts. Six use `OLD_FASHION`
and six `NEW_FASHION`, displayed by the existing UI as Old Fashion/New Fashion.
All expiry values are null. Size/color variants are described in the existing
description field; the schema has no separate size or color fields.

## Demonstrate predictions, alerts and reports

Run the existing frontend (`cd frontend; npm run dev`) and open its Vite URL.
Normally this is http://localhost:5500; the already-running alternate development
server at http://localhost:5501 also uses the same application and API.
Use `/login`, choose a demo account and open Dashboard.

For Medical/Restaurant/Grocery, the first six SKUs demonstrate:

| SKU suffix | Pattern | Expiry | Dashboard result |
|---|---|---|---|
| `01` | Fast: eight units/day, low remaining stock | Today | High seven-day replacement estimate |
| `02` | Rising: earlier 1/day, then 2/day, recent 6/day | Tomorrow | Sales-based estimate with recorded evidence |
| `03` | Stable: three/day | In two days | Moderate estimate |
| `04` | Slow: three isolated one-unit sales | Tomorrow | Small estimate |
| `05` | No sales | In two days | NO_DATA / Not enough data; null quantity |
| `06` | Only one two-unit sale | In two days | LIMITED confidence and caution |

These numbers are calculated by the real `salesBasis` and `processAlert` engine,
not inserted as fake predictions: `ceil(unitsSold / observationDays * 7)`.
The stock after expiry is not subtracted from this replacement quantity. Expand
**Sales basis and limitations** to inspect observation days, sale days and stock.
Dismiss one warning and reload: it stays dismissed, even after repeating seed.

SKU `07` is fast-moving with low stock and later expiry (Rice/Oral Rehydration
Salts/Polo Shirts); `08` has stable demand and ample stock; `09` is slow-moving;
`10` has no sales and no expiry; `11` has rising demand and low stock. `12` is an
expired batch for expiry stores, and an out-of-stock Clothing product. The expired,
later-expiry and missing-expiry products produce no upcoming alerts. Invalid dates
are not seeded; existing exclusion/validation is exercised by automated tests.

Open **AI Recommendations** and click **Generate AI Recommendations** to use
the existing owner-scoped API. Its fallback uses the existing 30-day demand,
minimum stock and days-cover rules. This is distinct from the dashboard's
seven-day post-expiry estimate. Clothing demonstrates this manual reorder flow,
fashion filters and reports; it has no expiry-warning/seven-day expiry flow.
Reports show recorded sales totals, inventory, low stock and existing expiry lists.
The existing Dashboard **Expiring** summary counts the next 30 days; its separate
warning cards cover only today through two days ahead. Seven in that summary and
six warning cards are therefore expected for each expiry-store demo.

Initial seed preparation deliberately makes no Gemini call. It invokes the real
alert processor with an unavailable-provider adapter, preserving its calculated
APPLICATION estimate and UNAVAILABLE status; no-sales alerts become NO_DATA.
The normal app can retry explanations after the existing 15-minute delay, subject
to the existing attempt limit. Manual generation uses the configured Gemini service
normally, with its existing validation, timeout, HTTP 429 cooldown and fallback.
An unavailable/rate-limited provider is not reported as successful Gemini output.

The existing rules intentionally differ: upcoming alerts compare UTC calendar
days and include today, while selling/manual-reorder expiry checks compare the
expiry instant. A date-only batch expiring today can therefore have a dashboard
warning but be excluded from live sales/manual reorder advice. No rule was changed.

## Reset only demo records

Stop the backend and avoid writing to demo accounts during cleanup:

```powershell
cd backend
npm run cleanup:demo
npm run seed:demo
npm start
```

Cleanup verifies the manifest, exact user IDs/email/name/store, ownership of
every surviving tracked record, supplier/product relationships, absence of extra
records and absence of foreign references. It atomically removes only tracked
demo records/users and derived alerts for those verified products. It never uses
a name prefix or a database-wide deletion. Repeated cleanup is harmless.

If someone added untracked records to a demo account, changed its identity or
created foreign references, cleanup refuses everything. Preserve those records,
or remove only the deliberate additions through the existing UI before retrying;
there is no unsafe force option. The local credential file is retained for the
next seed. Reset explicitly to regenerate dates relative to the new UTC day.

## Verification

`cd backend; npm test` runs unit tests, including dataset/model checks and the
unchanged prediction/structured-response/fallback tests. For browser/API tests,
stop the API occupying port 5000, then run `npm run test:browser:offline`.
That runner creates a random, marker-verified temporary Atlas database, starts
the real API with mocked external AI failure, runs the entire Playwright suite
and removes only that invocation's test database. It never calls paid Gemini.
It needs permission to create/remove a temporary database; its name is below
Atlas's 38-byte limit. Real application records are not used for test cleanup.

Actual verification results:

- `backend: npm test`: 55/55 passed after the final dataset changes.
- `frontend: npm run build`: passed, 72 transformed modules; unchanged React
  bundle hashes confirm no appearance/page implementation changes.
- `node --check`: all 57 first-party JS files passed.
- `npm run test:browser:offline`: all 30 existing browser/API tests and two new
  safety tests passed. One new test initially failed because it requested 1,000
  history rows instead of the API's actual 500-row maximum; no API change was made.
- Corrected `npm run test:browser:offline -- tests/demo-data.spec.js`: all three
  new integration tests passed. These exercised all stores, exact dataset counts,
  password/identity checks, repeated seeding, balanced stock, real calculations,
  no-sales behavior, dismissal persistence, normal authentication, foreign-owner
  rejection, collision rollback and cleanup refusal for untracked/foreign records.
  Temporary test databases were removed using their exact names/ownership markers.
- The initial temporary database name exceeded Atlas's 38-byte limit. The runner
  now uses a 36-byte random name. Those rejected attempts created no test dataset.
- Local `npm run seed:demo` succeeded and a second invocation reused the dataset.
  The manifest plus all 1,874 application documents had identical hashes after
  the second seed and the following read-only UI/API checks: zero changes/extras.
  All 25 records present immediately before seeding were preserved byte-for-byte.
  The initial 21 records observed at task start were also preserved; four more
  unrelated records appeared before seeding and were included in preservation.
- Actual local accounts were logged in through Chrome on port 5501. Each saw
  12 products; each expiry store saw six warnings; Clothing saw zero warnings
  and six rows for each fashion filter. Dashboard, reports and manual reorder UI
  were verified. The Clothing view passed a 390x844 overflow check. Screenshots
  are in ignored `frontend/test-results/demo-grocery-dashboard.png` and
  `demo-clothing-mobile.png`.
- Initial seven-day estimates read from the real local API were 55 (fast),
  17 (rising), 21 (stable), 1 (slow), null (no sales), 1 (limited history).
  The later-expiry fast product's manual rule-based reorder was 249 units in
  each store. These are observed calculation results, not seeded prediction rows.
- All 69 original backend/React/CSS/configuration files other than the deliberately
  updated backend package scripts matched their initial hashes. No CycleJournal
  access or modification occurred.

Automated tests and final local UI checks made no paid AI calls. A test-only
server helper disabled external AI and background processing during final checks
against the application database; production server/worker code was untouched.
The normal `npm start` backend is restored after verification, so subsequent
user actions use the existing real Gemini integration and its safe fallback.
