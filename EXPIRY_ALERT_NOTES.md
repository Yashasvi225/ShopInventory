# Stage 3 — Expiry alerts and sales-based purchase advice

Project: `C:\Users\Dell\OneDrive\Desktop\SIM_P2`. Stage 1 and Stage 2 are retained.
CycleJournal and the original frontend snapshot were not modified.

## Audit and design

Read README, MIGRATION_NOTES and STORE_TYPE_NOTES, then traced the existing
product, sale, stock transaction, retailer, authentication/session, controller,
API client, dashboard, toast, Gemini service, and test implementations.

Products own their current `quantity`, optional `expiryDate`, `shopType` and
`createdBy`. Sales have product identity, quantity, price, total, date and retailer.
The API allows backdated sales. Each sale already adjusts stock and creates a
stock-out transaction, so counting transactions again would double-count sales.
There is no batch-level inventory, supplier lead time, replacement shelf life,
returns model or persistent notification mechanism. The existing toast lasts
2.8 seconds; an expiry warning needs persistence rather than repeated toasts.

The smallest compatible implementation adds one `ExpiryAlert` collection and
a dashboard panel using existing styles/components. New authenticated routes
extend the existing `/api/ai` router:

- GET `/api/ai/expiry-alerts`: synchronizes the current retailer's eligible
  products, returns active warnings, and schedules asynchronous enrichment.
- PATCH `/api/ai/expiry-alerts/:id/dismiss`: persists owner-scoped dismissal.

No source records were migrated or seeded. Before implementation, fingerprints
were captured for 4 users, 3 products, 1 supplier, 2 sales and 4 stock transactions.

## Deterministic expiry detection

The product form submits ISO date-only values; Mongoose stores these at UTC
midnight, and the existing frontend date-input helper uses UTC ISO dates.
The new workflow consistently compares **UTC calendar days**, not a rolling
48-hour duration or the server's local timezone. Its UI displays the ISO day
explicitly and labels the UTC date convention.

The eligible dates are today, tomorrow and today + 2 days, inclusive throughout
each calendar day. Yesterday, later dates, missing/invalid dates and unsupported
store types are excluded. Clothing returns before reading/calculating expiry.
Both the retailer's current store type and product's store type must agree.
Deleted products and changed expiry events are filtered out of active responses.
Existing sale expiry restrictions and the existing 30-day reports are retained.

## Backend scanning and duplicate prevention

After database connection and unique-index initialization, the API runs an
immediate background scan and repeats every 15 minutes. Dashboard requests also
synchronize warnings immediately. No browser, Redis, cron service or queue is
required for backend detection while the API is running. Restarting the API
performs a catch-up scan.

The unique key is `(createdBy, product, expiryDay)`. Atomic upserts and the database
index prevent concurrent requests/processes from creating duplicate events.
Dismissal is saved on that event; refreshes do not reset it. A different expiry
date creates a different event. Returning to an already dismissed date preserves
its previous dismissal. Old events remain tracking records but are not shown as
current warnings.

Warnings are saved first. One worker per process enriches eligible events;
atomic claims and two-minute leases prevent concurrent Gemini calls across
processes. Ready/no-data results are cached per event. Failures retry no sooner
than 15 minutes later, with at most three attempts per event. Abandoned claims
are recoverable; a final abandoned claim becomes unavailable rather than spinning
forever. Failed recommendations do not remove warnings or alter stock.

## Actual sales basis and purchasing assumption

The server queries only the owning retailer's sales for the exact product,
from the UTC start of the last 30 calendar days through the current time. Future
sales are excluded. Ownership, product, dates and positive finite quantities
are checked again in the aggregation function.

Observation begins at the later of the 30-day window start and the earlier of
product creation or its first recorded sale in the window. This respects newer
products and the existing API's backdated sales. Calendar days with no recorded
sales are included; no stock transaction is treated as a second sale.

The purchase quantity is a transparent **seven-day post-expiry replacement
estimate**: `ceil(recorded units / observation days * 7)`. Seven days is an
explicit planning assumption, not an inferred supplier lead time. The current
batch is not usable after its expiry, so its stock is not subtracted from the
replacement quantity. Current stock, stock at analysis, and estimated unsold
stock at expiry are shown separately to make that assumption assessable.

No sales means no numerical recommendation and no Gemini call. Short histories
are labelled limited confidence. At least seven observation days and three
distinct sale days receive a moderate-evidence label; this is an evidence rule,
not a statistical confidence interval. Sales during stockouts, lead time and the
replacement batch's shelf life remain unknown. Recommendations are timestamped
snapshots, and the UI tells the owner to review later sales/stock before buying.
Unsafe/unrepresentable numerical estimates are withheld.

## Existing Gemini integration extended

`backend/services/geminiService.js` remains the single integration. Both existing
reorder recommendations and new expiry explanations reuse its client factory,
server-side `GEMINI_API_KEY`, `GEMINI_MODEL` and existing model default. The old
manual reorder workflow remains available. No keys are returned in alert data,
copied into React, logged by the new failure path, or included in the build.

Gemini receives only one owned product and its calculated sales basis. It never
detects expiry. Its structured JSON must echo the exact product ID and calculated
purchase quantity, and select explanation/caution codes from a constrained
vocabulary. The server verifies identity, a safe nonnegative integer, exact
quantity agreement and an evidence-appropriate caution. Only server-owned text
for accepted codes is displayed, preventing arbitrary model prose from inventing
sales figures or business facts.

Calls have a 30-second timeout with cancellation. Invalid JSON, invalid structured
responses, missing credentials, timeouts and provider failures retain the warning
and the separately saved deterministic estimate. The UI identifies this as an
application estimate with Gemini explanation unavailable. Logs contain an alert
ID, a bounded diagnostic code and optional numeric HTTP status, not provider
payloads or secrets. Database detection errors use the existing API error path;
the frontend retains loaded warnings and displays the error.

## UI and preserved scope

The dashboard adds a small persistent expiry section, polling while processing
and then once per minute, with a focus refresh. It does not generate toasts on
each refresh. The existing toast acknowledges dismissal. The warning shows
product/store, date/days remaining, current stock, suggested purchase, sales
basis, evidence level and provider status. Detailed reasoning, limitations and
snapshot information expand on demand. Clothing never mounts this component
and never requests expiry enrichment; Old Fashion/New Fashion is unchanged.

A browser check found dashboard chart overflow when resizing to mobile. Setting
the existing grid panels' minimum width to zero fixed the intrinsic chart sizing
without redesigning the dashboard or changing the original CSS files.

No automatic purchasing, stock changes, supplier orders, payments, AI chat,
clothing expiry or extra store types were added. No new dependencies or environment
variables are required. Alerts are in-app messages, not email/SMS/push delivery.

## Verification

Backend tests cover date boundaries, leap dates/timezones, store eligibility,
sales observation periods, limited/no history, actual stock, foreign/future/invalid
sales exclusion, unsafe quantities, structured Gemini validation, timeout,
missing credentials and database error propagation, alongside Stage 2 schemas.

Browser/API tests use actual Express/MongoDB and uniquely named temporary
retailers. Sales used for end-to-end recommendations are recorded through the
existing sales endpoint, not invented metrics sent to Gemini. Test-only malformed
history verifies isolation. Timeout/invalid-output fault injections exercise
the real persistence path; live success is never simulated. An intentionally
nonexistent model on a separately started copy of the same API verifies a real
provider failure and startup scanning without any prior browser request.

## Observed commands and results

- `npm test` in backend: **36 passed**, zero failures, including the existing
  11 Stage 2 schema tests and 25 new expiry/recommendation/error-path tests.
- `npm start` in backend: connected to the configured MongoDB and served the
  final API on port 5000; scanning and index initialization ran successfully.
- `npm run dev` in frontend: Vite served React on the existing port 5500.
  One attempt while the existing dev server was active reported port-in-use;
  restarting only the identified inventory Vite process resolved it.
- `npm test` in frontend: the first run had 15 passes and one mobile overflow
  failure. After the chart sizing correction, the focused two-test rerun passed,
  followed by all **17 development browser/API tests passing** (1.8 minutes).
- `npm run build` in frontend: the final production build passed, 67 modules,
  and emitted index plus the ten existing HTML page aliases without errors.
- `npm run preview` followed by `npm test`: all **17 tests passed against the
  final production application** (1.5 minutes), using actual API/MongoDB. The
  final UI's expandable evidence, desktop/mobile layouts and absence of missing
  assets/runtime errors were checked. Screenshots were inspected visually.
- `node --check` across all **32 backend JavaScript files**: passed.
- MongoDB fingerprint verification: all **14 original documents unchanged**,
  original collection counts restored, zero verification accounts and zero
  leftover test alerts. The unique event index exists. Temporary failure-test
  API processes were stopped in teardown; no environment file was changed.
- CycleJournal `git status --short`: clean. SIM_P2 is not a Git repository.

### Real Gemini outcome and external limitation

Two actual Stage 3 live expiry runs returned **READY / source GEMINI**, validated
the purchase quantity and displayed the recommendation using actual sales
recorded through the API. The existing manual reorder regression also returned
GEMINI on earlier runs. No successful provider response was mocked.

Later verification exhausted the configured account's provider quota: the final
expiry calls returned HTTP **429**, and the existing manual reorder workflow
used its rule-based fallback. Thus the final production suite exercised a real
quota failure as well as the deliberate provider-failure test. Alerts stayed
visible with the application estimate and an explicit unavailable explanation.
Additional live Gemini calls require provider quota availability; credentials
were not changed to bypass it. Timeout and invalid-response persistence paths
also passed with deliberate fault injection, not simulated success.

The backend and development frontend are left running on ports 5000 and 5500.
There is no outstanding application build/test failure. The current Gemini
quota limitation and the documented seven-day planning/snapshot assumptions are
the material limits of this stage.
