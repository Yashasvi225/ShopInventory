# Stage 4 — Production hardening and complete workflow validation

Project: `C:\Users\Dell\OneDrive\Desktop\SIM_P2`. No Stage 5 functionality was added.

## Inspection and data baseline

Read the Stage 1, 2 and 3 notes and traced all current React pages, session/storage,
API calls, charts, modals, loading/error components, Express routes, authentication,
controllers, models, validators, Gemini and expiry worker implementations and tests.
Every sensitive router uses authoritative JWT protection. There are no additional
roles, store categories or notification delivery channels to implement.

Read-only MongoDB inspection found 4 users, 3 products, 1 supplier, 2 sales,
4 stock transactions and no saved expiry alerts. All 14 existing documents were
fingerprinted before writes; no negative stock was found. A database `hello`
inspection confirmed the configured server is a replica set supporting transactions.
No records were reset, rewritten, migrated or seeded. All verification records
belong to exact temporary UUID identities and are removed by owner-scoped teardown.

## Concrete defects and corrections

### Validation and error handling

The original number helpers accepted `true` as 1, `[]` as 0 and other JSON coercions.
Required text accepted objects as `[object Object]`. Dates could normalize an
impossible calendar date, and quantities below the existing schema minimum caused
late write failures. These are now rejected before stock changes. Supported numeric
strings and quantities of at least 1, including fractional values, remain accepted;
existing optional expiry defaults and Clothing normalization remain unchanged.
Numerical values are finite and within the safe magnitude range; stock additions
and sale totals cannot overflow that range. Store selections and IDs are typed.

JSON bodies must be objects; malformed JSON gets a useful 400. Date filters and
result limits are validated, retaining the existing 200/500 defaults with a 500
maximum. Search is literal, so entering `[` no longer produces a regex/database
error. Optional text/reference fields cannot smuggle malformed JSON values.

Unexpected backend errors previously returned raw messages and development stacks.
They now return a generic useful 500; parser, validation, duplicate and known
business errors remain actionable. Logs omit raw errors/secrets. Private API
responses use `no-store`, and responses use `nosniff`.

The frontend previously accepted malformed successful responses as valid data,
leading to `.filter`, `.map` or property-access crashes. The central API client
now validates the contract portions consumed by each view. It handles malformed
JSON, network failures, 400/401/403/404/409/429/500 and bounded timeouts. Internal
500 bodies are not displayed. Wrong login credentials get an authentication error;
protected-request 401s still clear the session. Mutation timeouts explicitly ask
the user to check records before retrying because a timed-out write may have committed.

### Inventory, history, dates and ownership

Stock/sales previously changed a product then wrote history using compensating
rollback steps. Concurrent sales could consume temporarily added stock before a
failed stock-in was rolled back, and process interruption could leave partial
history. Product, sale and stock transaction writes now share a MongoDB transaction.
Supplier deletion and detachment also commit together. Unsupported transaction
deployments fail closed rather than silently performing partial writes.

Product edits previously submitted the stock value from an old form. React now
sends an optional `expectedQuantity` precondition; the backend compares it and uses
a conditional update so intervening stock changes produce 409 rather than lost
inventory. The field is request metadata, not a new stored product/business field.
Existing API callers may still explicitly adjust quantity without that metadata.
Document validation runs before conditional writes, preserving conditional Clothing
fashion validation and null expiry normalization. Store-mismatched stock/sale
writes are rejected; product ownership is checked inside the transaction.

Populated product/supplier references previously had no secondary owner match.
Owned but corrupt/imported history could therefore expose another owner's product
name. Every relevant population now matches the authenticated owner; foreign
references become null, preserving the existing deleted-product/history UI.

Report periods used server-local boundaries while forms/expiry alerts used UTC.
Reports now use UTC day/week/month boundaries and exclude future sales from current
period totals. Sales input/filter dates and manual AI lookbacks consistently use
UTC. Existing sale restrictions, 30-day expiry reports and Stage 3's exact
today/tomorrow/two-days alert eligibility are retained.

### Gemini and measurable request/write problems

The existing manual Gemini call had no timeout, logged full provider diagnostics,
accepted excessive quantities and matched products by name. It now uses the same
bounded/cancellable helper as expiry recommendations, logs safe status/code only,
and validates exact product IDs (including identical product names), positive safe
integer quantities and the existing rule-based target as an upper bound. Invalid
responses use the existing rule-based fallback. Displayed demand observations come
from the actual server calculation. No purchasing formula or expiry rule was replaced.

An actual HTTP 429 starts a 15-minute in-process cooldown shared by this integration,
preventing subsequent known-quota calls during that period. Expiry warnings and
application estimates remain available. Retailer profile/contact/authentication
data is not sent to Gemini. Browser responses expose source/status, not provider
configuration or credentials. Built assets are checked for the configured key.

Repeated alert polling previously upserted identical events and changed timestamps.
Already-known events now skip the write; uniqueness still protects concurrent first
insertion. Tests compare timestamps and attempts across repeat requests. Sales
queries project only needed fields and exclude future records. The expiry basis
uses a reduction instead of a large argument spread that could exhaust the call
stack on large histories. No cache of invented business data was introduced.

### UX and accessibility

Forms now have a synchronous submission lock, disabled fields during writes and
busy semantics. Both AI action buttons use the same lock. Tests submit twice before
React can render and verify one real product creation. Errors remain visible and
success feedback still uses the established toast.

Modals use a body portal, make the background inert, trap keyboard focus among
visible enabled controls, and restore the opener's focus. Closed mobile navigation
is inert rather than leaving offscreen links in the keyboard order. Opening it
focuses a link; Escape closes it and restores the menu button. Background content
is inert while the mobile menu is open. Scrollable tables are keyboard focusable.
Labels, modal names, focus styling, form layouts and the Stage 3 chart sizing fix
remain. Screenshots are inspected against the existing palette/design.

### Dependency audit

Frontend audit reported zero vulnerabilities. Backend audit found a high-severity
development-only chain through nodemon → chokidar → braces. The published
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched
version. Rather than the audit's suggested major downgrade, the backend `dev`
script now uses the installed Node's built-in `--watch` mode. Removing nodemon
removed 25 packages; the backend manifest/lockfile changed only for this tooling
removal. No UI library, infrastructure, environment variable or runtime dependency
was added. Both full audits are clean after removal.

## Tests and executed verification

Backend tests cover Stage 2/3 schemas and expiry/forecast logic plus malformed
numbers/strings/dates, safe errors, literal search/query limits, manual Gemini
identity collisions and bounded quantities. Valid structured Gemini results are
tested as unit fixtures, never claimed as a live provider success.

Browser/API tests use actual MongoDB/Express for CRUD, transactions, reports,
authorization and recommendations. Deliberate provider failures and HTTP/network
response faults are clearly separated test injections; they are not fake successful
application journeys. Transaction-failure injection uses real database transactions
and verifies unchanged stock/history after a history-write exception.

Observed results:

- `npm test` in backend: **43 passed**, zero failures after final fixes/tooling removal.
- `npm start` and backend `npm run dev`: API connected to the existing database and
  served health on port 5000. Native watch mode was started and served the application.
- `npm run dev` in frontend: Vite served React on port 5500.
- Existing 17-test regression suite: **17 passed** after hardening.
- Focused new workflow suite: **11 passed**; later date/store validation checks:
  **3 passed**. The selectors also included the Clothing malformed-data regression.
- Expanded development suite: **27 passed (2.2 minutes)**. Every store completed
  registration/selection, desktop inventory journeys, login/session/logout, products,
  suppliers, stock, sales, reports, expiry and existing AI workflows.
- All four additional mobile journeys completed login, keyboard navigation/modal,
  product creation/editing, one-write double submission, stock-in, sales, inventory,
  reports and logout. Eligible-store warnings were visible, dismissed and remained
  dismissed after refresh; Clothing retained Old/New Fashion and no expiry UI.
- Eight concurrent sales against five units yielded exactly five committed sales,
  five history entries, zero remaining stock and three rejected requests.
- Deliberate history-write failures left stock, sales and transaction records
  unchanged. Stale edits and store-mismatched writes were rejected.
- Every sensitive route rejected unauthenticated requests. Cross-retailer read,
  update/delete, stock/sales, supplier and alert attempts were rejected; corrupt
  foreign references were hidden. Owner-scoped Gemini bases excluded foreign sales.
- Network errors, invalid JSON/contract bodies, HTTP status errors and a hung browser
  request produced visible messages without React crashes; protected 401 cleared
  the session. API error tests verified no private error content/stack disclosure.
- `npm run build`: final build passed, 69 modules and all existing HTML aliases.
- `node --check`: all **45 backend/frontend JavaScript files** passed; JSX is checked
  by the production build. Original CSS files, environment and frontend lockfile
  were not edited. CycleJournal remains independent and unchanged.
- `npm audit` / `npm audit --omit=dev`: final audits returned zero vulnerabilities.

Final verification after all code and dependency changes:

- Production preview: **27 browser/API tests passed (2.5 minutes)**.
- Repeated JavaScript syntax check: **45 files passed**.
- Raw MongoDB document fingerprints: **all 14 original documents unchanged**;
  no differing documents and no verification accounts remained.
- Final collection counts matched the baseline: users 4, products 3, suppliers 1,
  sales 2, stocktransactions 4, expiryalerts 0. Temporary test records were removed
  without resetting or migrating the database.
- Production screenshots were inspected for the Medical and Clothing mobile
  product forms and the expanded mobile expiry warning. Automated mobile workflows
  verified all four stores, keyboard accessibility and absence of horizontal overflow.
- Live Gemini requests returned **HTTP 429**. Safe fallback, persisted warnings,
  dismissal and retry/cooldown behavior passed. A successful live Gemini response
  could not be re-verified during Stage 4; structured success validation passed
  unit tests and is not presented as a live provider result.
- Development servers were restored: frontend `http://localhost:5500/dashboard.html`
  returned HTTP 200 with the React/Vite development entry; backend
  `http://localhost:5000/api/health` returned HTTP 200 and the Shop Inventory Manager
  service identity. The backend root `/` has no route and returned its expected 404.
- CycleJournal's final Git status remained clean. Stage 5 was not started.

## Exact principal commands

From `backend`: `npm start`, `npm run dev`, `npm test`, `npm audit --json`,
`npm uninstall --save-dev nodemon --ignore-scripts --no-fund`, `npm audit --omit=dev`.
From `frontend`: `npm run dev`, `npm run build`, `npm run preview`, `npm test`,
`npm audit --json`, `npm audit`, and the focused selectors:

```powershell
npm test -- --grep 'Malformed product|Concurrent sales|History-write|Every sensitive|mobile login|Network, malformed|hung frontend'
npm test -- --grep 'Concurrent sales|Malformed product'
```

`node --check` was executed programmatically for each non-dependency `.js` file in
backend, frontend/src and frontend/tests. MongoDB `hello`, read-only baseline/
fingerprint/count checks and `git -C ...\CycleJournal status --short` completed
the inspection/data-preservation checks. No database reset/migration command was run.

## Stage 5 — Final SIM_P2 completion review

All Stage 5 commands and changes use
`C:\Users\Dell\OneDrive\Desktop\SIM_P2`. The active source, configuration,
tests and generated frontend assets contain no dependency on another project.
References to the former workspace in earlier stage notes intentionally record
historical context; that workspace was not inspected or modified for Stage 5.

The independent review traced frontend contracts/session/navigation and backend
authentication, owner-scoped routes/references, models, transactional writes,
reports, Gemini and expiry workers. The configured ports are 5500/5000, both
localhost frontend origins are allowed, all required backend settings are present,
and the configured MongoDB replica set supports transactions. Environment values
and original records were preserved.

Four confirmed remaining defects were corrected:

- Nested malformed HTTP-200 fields (for example an object category or numeric
  populated product name) could pass the response contract and crash rendering
  or string operations. Consumed nested text/date/reference/numeric fields are
  validated before the view receives them. Optional legacy null/missing fields
  and deleted/unpopulated references remain supported. Eight new fault cases
  extend the existing browser error-state test.
- Missing or blank manual Gemini response text was converted to `[]` and labelled
  successful. It now fails with `INVALID_RESPONSE` and uses the existing fallback;
  an actual valid JSON `[]` remains a valid response.
- A provider HTTP 429 whose detail mentioned a temporary 503 error could enter
  the manual retry loop despite starting cooldown. HTTP 429 now stops immediately,
  independently of detail text. A local SDK fault test verifies one call and no
  subsequent call during cooldown.
- Registration accepted passwords exceeding bcrypt's 72 UTF-8 byte input limit,
  allowing different suffixes to authenticate identically. New registrations
  reject those inputs before database access. ASCII and multibyte boundary tests
  cover rejection and exact-boundary acceptance; existing hashes/login remain
  compatible and no existing user record was changed.

Dependency verification exposed 25 extraneous packages left in the installed
backend tree, including the removed watch tooling. `npm prune --ignore-scripts
--no-fund` removed them; `npm ls --depth=0` then showed only declared dependencies.
The missing `backend/.env.example` was added with empty secret placeholders for
fresh setup, and README now identifies SIM_P2 explicitly. Existing `.env` was
not overwritten. No runtime dependency, category, business feature or redesign
was added.

The intentional provider-failure browser test now injects failure into a separate
actual API process before startup. It verifies real persisted alerts, startup
scanning and the browser UI without spending quota on a deliberately invalid model.
Success validation uses clearly identified local unit fixtures, never a claimed
live provider result. Main application live checks retain the configured provider
and the existing quota cooldown.

The first development suite finished with 24 passes and three connection failures.
Logs traced these to the previously running SIM_P2 watch process restarting during
file synchronization. That verified process was stopped and a single `npm start`
API process was started. All three affected tests then passed (20.8 seconds).
The complete suites were rerun against the stable runtime; final results follow.

### Stage 5 final observed results

- Backend `npm test`: **48 passed**, zero failures, including the five new
  registration/provider regressions. The initial baseline run also passed all 43
  pre-existing tests before the final fixes.
- Full development browser/API suite: **27 passed (2.1 minutes)** after the three
  affected connection tests passed in the focused rerun.
- Full production-preview browser/API suite: **27 passed (1.9 minutes)**. The
  served HTML was independently checked for the built bundle and absence of the
  Vite development client before execution.
- Production build: **passed, 69 modules**, index plus ten matching page aliases.
  Final `node --check`: **47 JavaScript files passed**, including backend, frontend
  source/tests and both Vite/Playwright configuration files; the build checks JSX.
- Desktop journeys covered authentication/session restoration, selection, all
  stores, supplier/product CRUD, search, stock changes, sales, reports/charts,
  recommendations, warning eligibility/dismissal, logout and retailer isolation.
  Four mobile workflows covered navigation/focus/Escape, modals, product creation
  and edits, duplicate submissions, stock/sales, reports, warnings and logout.
  No unexpected runtime/missing-asset errors or horizontal overflow occurred in
  those flows. Production mobile screenshots for all four forms and expanded
  expiry evidence were visually inspected.
- Concurrency, stale edits, transaction rollback, foreign-reference isolation,
  authentication errors and malformed request/response faults passed against the
  actual API/database. Date-boundary and no-history rules remained intact;
  Clothing retained Old/New Fashion with no expiry UI, scans or expiry advice.
- Backend full audit/prune audit and backend production audit: **zero vulnerabilities**.
  Frontend full audit: **zero vulnerabilities**. Both installed dependency trees
  were checked with `npm ls --depth=0`; backend extraneous packages were removed.
- Frontend source/CSS/build secret scan: **42 files checked, zero configured
  Gemini/JWT/database secrets exposed**. Ten built aliases matched index byte for
  byte. Active application/configuration/test/build searches found no reference
  to the former project. Node version was verified as **24.21.0**.
- CORS allowed both configured frontend localhost origins; an unconfigured origin
  received no allow-origin header. Backend health and frontend development entry
  both returned **HTTP 200** after restoring the development server.
- Gemini remained **HTTP 429 / unavailable**; manual recommendations used
  `RULE_BASED`, and persisted expiry estimates used `APPLICATION`. Timeout,
  malformed response, provider failure, 429 and cooldown paths passed. Successful
  structured-response handling passed local fixture tests; a successful live
  provider response was not re-verified or fabricated. Quota remains the external
  limitation. No credentials/model were changed to bypass it.
- Final raw MongoDB fingerprints: **14 original documents checked, zero changes**.
  Zero additional documents, zero temporary verification accounts and zero negative
  stock. Counts matched baseline: users 4, products 3, suppliers 1, sales 2,
  stocktransactions 4, expiryalerts 0. Only exact test-owned records were cleaned;
  no reset, migration or fake production seed was run. The temporary fingerprint
  file was removed after comparison.
- SIM_P2 backend remains running with `npm start` on port 5000; the frontend was
  restored with `npm run dev` on port 5500. No application failure remains in the
  tested flows. Full-list inventory/report contracts remain unchanged; large-scale
  load capacity is outside these workflow tests.

### Stage 5 commands actually executed

From `backend`:

```powershell
npm ls --depth=0
npm audit --json
npm prune --ignore-scripts --no-fund
npm test
npm start
npm audit --omit=dev
```

From `frontend`:

```powershell
npm ls --depth=0
npm audit --json
npm audit
npm run build
npm test
npm test -- --grep 'Timeout and invalid provider|Alert ownership|An injected provider'
npm run preview
npm run dev
```

The full frontend command was executed for the initial interrupted run, the clean
development rerun and production preview. Dependencies were already installed;
`npm ci` is a setup instruction, not a claimed Stage 5 execution.

From the SIM_P2 root, inline Node scripts ran `node --check <file>` for each active
JavaScript file, compared raw MongoDB fingerprints/counts using the existing driver,
scanned frontend files for exact configured secret values without printing them,
and compared production HTML aliases. `node --version`, `rg` identity searches,
`Invoke-WebRequest` health/entry/CORS checks and process inspections were executed.
Only verified SIM_P2 server process IDs were stopped during runtime correction and
dev/preview switching. No command was run in another project directory.
