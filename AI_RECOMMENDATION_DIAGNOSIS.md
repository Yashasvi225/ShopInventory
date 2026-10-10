# AI recommendation diagnosis and fix

Inspected and verified in SIM_P2 on 2026-10-10. No migration, reseeding, password
change, model/schema change, or inventory calculation change was performed.
The decision to keep the existing dataset owners unchanged remains in effect.

## Observed failure and request trace

`AIRecommendations.generate()` calls `GET /api/ai/reorder-suggestions`, with no
request body. `api.js` supplies the current session's Bearer token and
`X-Store-Id`. The normal authentication middleware resolves User; store middleware
requires a Store owned by that User. The controller scopes both Products and Sales
by `createdBy` and `store`, and further restricts Sales to supplied product IDs and
the current 30-calendar-day lookback. No missing/foreign product-sales links were
found in the checked Restaurant inventory.

One live Generate request against the previously verified inventory owner's
Restaurant store returned **HTTP 200, RULE_BASED, three suggestions, 748 units**.
The existing backend log recorded **Gemini HTTP 503** after its normal three
attempts. Earlier log entries also included rejected structured responses
(`INVALID_RESPONSE`); those earlier entries do not establish the cause of the
provided screenshot. No additional live generation request was made for debugging.
The existing application retry behavior was preserved.

The provider failure explains the fallback label. The old service returned only
`suggestions` and `source`, discarding the failure category. The frontend consequently
showed the same generic failure for configuration, quota, timeout, invalid output
and provider unavailability. An empty list also had a generic explanation without
indicating whether products were absent, expired, adequately stocked, or lacking
recent sales. This diagnostic loss was confirmed in the actual API response/code.

**The exact screenshot's zero-result state was not reproduced on the populated
Restaurant store.** It currently yields three eligible fallback suggestions.
The screenshot does not identify an account/store ID; the account email was
requested to resolve that ambiguity. Do not attribute zero results to corrupted
history, a formula defect or a specific account without that evidence.

## Actual data and configuration

The previously transferred inventory remains under its existing owner. Its
Restaurant Store has **12 products, 414 sales in the supported window, zero
unlinked sales, four expired products and three stock-rule-eligible products**
at inspection. Two products have zero average recent daily sales. Calculated
purchase units for the three eligible products total **748**.

The separate existing account discussed in the most recent migration request has
four owned Stores but its Restaurant Store has **zero products and zero sales**.
Its real endpoint returns **NO_DATA**, not a successful Gemini analysis. It needs
its own valid products and completed sales entered through Products/Inventory/Sales.
No records were copied from another owner and no sales or advice were invented.

The backend reads `GEMINI_API_KEY` and `GEMINI_MODEL` from backend configuration.
The key is configured (value never included in this report). The selected model is
`gemini-3.6-flash`; installed `@google/genai` is **1.52.0**. The SDK defaults to
the Gemini Developer API `v1beta`. A single model-metadata GET returned **HTTP 200**
and advertised `generateContent`. That confirms model discovery, not successful
generation, sufficient quota or sustained provider availability. The installed SDK
was kept unchanged. Model/API usage was checked against
[Google's generation API documentation](https://ai.google.dev/api/generate-content)
and [SDK model metadata documentation](https://googleapis.github.io/js-genai/release_docs/interfaces/types.Model.html).

## Fix applied

- Add safe, optional `providerError` metadata to fallback responses. It contains
  only a fixed error code, optional HTTP status and optional quota retry time.
  No raw provider error text, prompt, inventory payload, credential or token is
  logged/returned as a diagnostic. HTTP 200 continues to mean the backend returned
  usable analysis/fallback; a nested provider HTTP 503 is displayed separately.
- Add optional `analysis` counts and an empty-result reason to the controller.
  These describe real inputs and existing eligibility; they never add suggestions.
  No-product stores continue bypassing Gemini entirely.
- Show explicit configuration/access, model, invalid-request, quota, timeout,
  network, provider-unavailable and invalid-output messages in the existing UI.
  Keep RULE_BASED distinct from GEMINI, including when fallback returns zero.
  Explain no products, all expired, no recent sales, adequate stock, or a valid
  empty model response without pretending to have generated recommendations.
- Keep structured response validation. Tighten eligibility so model rows cannot
  advise purchases for products rejected by the existing fallback stock rules.
  Quantities remain bounded by the same calculated target. Foreign/duplicate IDs,
  expired products, malformed output and unsupported quantities are rejected.
- Reuse the same counter calculations through a tested helper: returned rows,
  positive-quantity rows and the sum of returned quantities. Maintain existing
  loading/error/busy behavior and compatibility with older responses without
  diagnostic metadata. Validate the new optional metadata in the frontend contract.
- Replace private values found in `.env.example` with installation placeholders.
  The actual `.env` was not edited. No new dependencies were installed.

The manual reorder fallback is unchanged: stock at/below minimum, or positive
daily sales with at most 14 days of stock cover; target remains
`max(minimumStock * 2, ceil(averageDailySales * 30 + minimumStock))`, with the
existing positive reorder rule. Its minimum-stock advice can exist without sales;
that is labeled stock guidance, not fabricated demand. The separate expiry
seven-day estimate, insufficient-sales behavior and dismissal persistence were
not changed.

## Application checks

`SIM_READ_ONLY_VERIFICATION=1; PORT=5010; node tests/helpers/offlineServer.js`
started a verification API against the existing application database with Gemini
and expiry workers disabled. `SIM_READ_ONLY_VERIFICATION=1; node
tests/helpers/verifyAiLive.js` exercised the actual React Generate action and normal
authentication/store middleware through this API. A short-lived signed JWT was
used; private account passwords were not requested, read, changed or tested.

Results saved in `backend/test-results/ai-live-diagnostics.json`:

- Empty Restaurant: NO_DATA, zero cards, counters 0/0/0, specific no-product message.
- Populated Restaurant: RULE_BASED, three cards, counters 3/3/748, explicit provider
  configuration message because Gemini was deliberately disabled for this QA.
- Requests use GET, the expected endpoint and the correct active Store header.
- Foreign Store requests return 404 across Products, Suppliers, Inventory, Sales,
  Reports and both AI endpoints; no alternate owner's data becomes available.
- All seven routes loaded for both checked accounts, no browser errors, no demo
  labels, no AI-page horizontal overflow at widths 375, 768 and 1440.
- Exact BSON hashes of all application collections matched before/after these
  read-only checks. Ownership and real database records were not changed by QA.

Successful real Gemini generation is **not verified by this workflow**. Success
rendering/structured validation are covered with mocks. The actual observed
generation ended with provider 503, while actual rule-based fallback worked.

## Test-run isolation incident and recovery

The first browser run was interrupted and is not counted as passed. An older
normal backend watcher reclaimed port 5000 during testing; the existing runner's
preflight mistakenly called `health.ok()` rather than reading the boolean
`health.ok`, and its startup check accepted any healthy service. Requests then
reached the application database instead of the isolated test database.
Normal provider workers also ran during that takeover; the interrupted test log
observed a READY/GEMINI expiry response. This was an unintended consequence of
the isolation failure, not a controlled successful test of the manual Generate
workflow. The initial run therefore cannot be described as fully mocked or used
to claim that manual Gemini generation works. The corrected rerun uses only its
identified offline API and mocked provider; the read-only live QA disables workers.

Before cleanup, a new encrypted DPAPI BSON checkpoint was created and verified
by restoring documents/indexes in a random marker-owned database, then removing
that verification database:

`backend/backups/ai-test-interference-recovery-2026-10-10.dpapi.json`

Payload SHA-256:
`9d5dcffa8328c51149d55af5f440bfbcc88fbf922c2f617dc57f22e3201dcfb7`

Only the **19 exact test User IDs** positively matched to this invocation's fixture
UUID emails/names and creation window were cleaned up transactionally. Their
14 expiry events, 15 sales, 24 stock movements, 26 products, four suppliers and
31 Store memberships were also removed. Cross-owner references were checked first.
All unrelated documents were compared by BSON hashes before/after and matched.
Neither real account, its credentials nor previously migrated data was removed.
No whole-database restore or demo-account cleanup was performed.

The runner now refuses an occupied API port before database setup, requires its
unique health identity, monitors that identity during the run and stops its own
browser process tree if isolation is lost. Test account setup also verifies the
identity before writing. These checks live in test tooling; production
authentication/authorization was not changed. A deliberate second runner
invocation against the occupied port exited 1 with the expected refusal before
creating test data. The new isolated rerun's final result is recorded below.

## Commands and outcomes

- `npm test` in backend: **96 executed, 95 passed, one failed, no skips**.
  The failure is the previously documented login-message mismatch in
  `authValidation.test.js`: current controller says `Invalid password`, existing
  test expects `Invalid email or password`. This task did not change login or
  weaken its validation to make the suite pass.
- `node --test tests/recommendations.test.js tests/expiryAlerts.test.js
  tests/hardening.test.js`: **44 passed, zero failed**, with external Gemini mocked.
  Covers successful structured output, valid empty output, configuration/access,
  quota/cooldown, timeout/network/503, malformed/duplicate/foreign/ineligible output,
  real fallback, no data, active-store scopes and unchanged expiry estimates.
- `npm run build` in frontend: **passed**, 81 modules transformed;
  generated JavaScript `index-DUnOU39i.js`, existing CSS `index-B4QqSnSY.css`.
- `npm run test:browser:offline -- tests/ai-diagnostics.spec.js
  tests/sales-reports-ai-ui.spec.js tests/multi-store.spec.js tests/expiry-alerts.spec.js`:
  **32 passed in 4.2 minutes** on the clean isolated rerun. The invocation removed
  its own test database. External provider calls were mocked/disabled. This covers
  the new diagnostic messages/counters, actual empty/adequate-stock states, sales
  entry and stock deduction, report filters, multi-store registration/switching,
  ownership denial, Clothing restrictions, expiry warnings/dismissal, and checked
  responsive layouts. The interrupted earlier run is not included as a pass.
- Live read-only verification and occupied-port refusal: results described above.

The temporary read-only verification API was stopped after QA. The normal
SIM_P2 backend and existing Vite frontend were restored on ports 5000 and 5500.
Final health checks returned HTTP 200 for both. Source/dependency file-touch
notifications caused several initial watch restarts; no code was reverted to
mask those notifications. No further manual paid generation was requested.

## Files changed

Application: `backend/services/geminiService.js`,
`backend/controllers/aiController.js`, `frontend/src/pages/AIRecommendations.jsx`,
`frontend/src/utils/recommendationMessages.js`, `frontend/src/apiContract.js`.

Configuration example: `backend/.env.example` (placeholders only).

Tests/tooling: `backend/tests/recommendations.test.js`,
`backend/tests/runBrowserTests.js`, `backend/tests/helpers/offlineServer.js`,
`backend/tests/helpers/verifyAiLive.js`, `frontend/tests/ai-diagnostics.spec.js`,
`frontend/tests/fixtures.js`.

Report: this file. Build refreshes generated frontend `dist` artifacts.
No auth controller/routes, environment secrets, database models, expiry service,
seed scripts or existing ownership migration utilities were modified by this task.
