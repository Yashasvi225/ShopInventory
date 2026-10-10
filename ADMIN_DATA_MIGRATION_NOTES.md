# New target inspection: noushiknani@gmail.com

Request inspected on 2026-10-10 from attachment
`c07d0d2d-6bdd-4a43-8f86-4785fed87352/Pasted text.txt`.
This is a different destination from the completed transfer documented below.
**No inventory, account, credential, store, or application-source changes have
been made for this new request.** The inspections below used read-only queries.

**Final decision:** The user explicitly selected "Keep existing owners unchanged;
do not migrate." No reassignment will be performed. The previously transferred
dataset stays with `noushik@gmail.com`, the older Grocery transfer stays with
`yaramattiyashu13@gmail.com`, and `noushiknani@gmail.com` retains its existing
four empty stores. The conditional plan below is historical documentation only;
it is not authorized for execution. No further approval is pending.

## Verified new destination

The application's User model resolved existing `noushiknani@gmail.com` to
`6ac9f0203b33bbc31c806b3a`, name Noushik, default type MEDICAL.
All five inventory collections currently contain zero records for this user.
The existing multi-store architecture supports its four memberships:

| Type | Existing Store ID |
| --- | --- |
| Medical | `6ac9f0223b33bbc31c806b3c` |
| Restaurant | `6ac9f0223b33bbc31c806b3e` |
| Grocery | `6ac9f0223b33bbc31c806b40` |
| Clothing | `6ac9f0223b33bbc31c806b42` |

No new account, password change, administrator privilege, or schema change is
required. Target password login has not been tested or changed.

## Actual sources and blocker

Both persisted seed manifests remain present. Their original source identities
were checked directly against the database, including record counts in Products,
Suppliers, Sales, StockTransactions and ExpiryAlerts:

| Dataset | Type | Original dedicated User ID | Current state |
| --- | --- | --- | --- |
| Local | Medical | `6ac8a3c930da67778270befe` | Retired; zero records |
| Local | Restaurant | `6ac8a3ca30da67778270c1ad` | Retired; zero records |
| Local | Grocery | `6ac8a3cc30da67778270c45c` | Retired; zero records |
| Local | Clothing | `6ac8a3cd30da67778270c70b` | Retired; zero records |
| Presentation | Medical | `6ac91ba2d385c9dd094972bf` | Retired; zero records |
| Presentation | Restaurant | `6ac91ba5d385c9dd0949756e` | Retired; zero records |
| Presentation | Grocery | `6ac91ba8d385c9dd0949781d` | Account retained; zero records |
| Presentation | Clothing | `6ac91babd385c9dd09497acc` | Retired; zero records |

There is **no remaining dataset owned by a dedicated demo account to transfer**.
The applied, retired audit
`demo-consolidation-to:6ac9c7708f22f0222f37f6d0` identifies the completed transfer
to existing real account `noushik@gmail.com` (`6ac9c7708f22f0222f37f6d0`).
Its currently owned records were independently counted again:

| Type | Products | Suppliers | Sales | Stock movements | Stored expiry events |
| --- | ---: | ---: | ---: | ---: | ---: |
| Medical | 12 | 3 | 428 | 452 | 6 |
| Restaurant | 12 | 3 | 428 | 452 | 6 |
| Grocery | 12 | 3 | 214 | 226 | 6 |
| Clothing | 12 | 3 | 434 | 458 | 0 |
| Total | 48 | 12 | 1,504 | 1,588 | 18 |

The older Grocery transfer audit
`presentation-grocery-to:6ac91488a1321476acb6c897` still belongs to real account
`yaramattiyashu13@gmail.com` (`6ac91488a1321476acb6c897`): 12 products,
three suppliers, 214 sales, 226 movements and six stored expiry events.
Those records are excluded from the proposed scope and remain untouched.

The new attachment says "Preserve existing user accounts, password hashes,
sessions, real records" and "Other users' records are unchanged."
Reassigning the completed dataset would remove records from an existing real
account. A corrected destination alone does not settle that conflicting scope.
Do not apply the old migration to the new user, restore the old database,
recreate retired source accounts, copy histories, or reseed to bypass this issue.
The old migration's exact-email guard remains unchanged.

## Conditional reassignment plan, not authorized for execution

If the user explicitly authorizes moving the previously transferred dataset from
`noushik@gmail.com` to `noushiknani@gmail.com`, the proposed scope is only the
48 products, 12 suppliers, 1,504 sales, 1,588 movements and 18 expiry events above.
Preserve their IDs and current business values; change only `createdBy` and the
matching destination `store`. Leave both real User identities, credentials and
their four Store memberships intact. Do not move any unaudited later record or
the other real account's earlier Grocery transfer.

Before application, recheck audited provenance, current relationships and counts,
stock/sales balances, store-specific validity, target collisions and new dependent
records. The currently empty destination has no observed collisions; account-wide
SKU and supplier conflicts must still be checked at transaction time. Stop if
later activity makes this scope unsafe. Preserve current alert dismissal and
recommendation caches, including legitimate worker updates since the first
transfer; do not restore older cached values or fabricate new predictions.

Create a **new** encrypted DPAPI BSON checkpoint of the current database and
verify document/index restoration in an isolated owned database before writing.
Existing original-transfer backups remain historical recovery points, not a safe
whole-database reset for this request. No new backup has been created or claimed
verified during this read-only inspection.

Use a transaction with a separate linked reassignment audit, exact before/after
hashes and ownership maps; keep earlier audits intact. Repeat execution must
verify the new audit without duplicating history. Selective rollback must restore
only the reassigned records from that new checkpoint and refuse changed records,
new dependencies or identity conflicts; never discard subsequent writes. Do not
delete either real account or any additional demo account for this reassignment.
Verify all four destination stores, calculated reports/recommendations, isolation
and rendered labels afterward. No live migration or its verification is claimed
complete for the new target.

## UI and verification for this inspection

The inspected React source contains no matches for `demo` or `sample data`.
Previously transferred presentation labels were already removed from the data.
No UI cleanup or application change was needed during this inspection.
User/Store, Product and ExpiryAlert schemas, registration/login implementation,
seed manifests and existing transfer guards were inspected. Read-only User-model,
store, migration-audit and per-owner/per-store count queries all completed.
Commands actually run for this request:

- `npm test` from `backend`: 89 tests executed, **88 passed, one failed**, no
  skips. The existing test in `tests/authValidation.test.js:65` expects the
  generic `Invalid email or password` message for failed login, while the current
  `controllers/authController.js` returns `Invalid password`. This request did
  not modify that controller or its tests; the mismatch is reported rather than
  changing current authentication behavior to obtain a passing result.
- `npm run build` from `frontend`: **passed**, 80 modules transformed,
  `index-CEkwVutO.js` and `index-B4QqSnSY.css` produced.
- Read-only Node scripts with the existing User model and database connection:
  target existence, four owned Stores, zero target records, both seed manifests,
  all eight original dedicated identities, both applied transfer audits, and
  current per-store record counts were verified successfully.
- `rg -n -i 'demo|sample data' frontend/src`: no matches. A source search is not
  a rendered-browser check for this new target.

No new-target password login, migrated-data browser checks, expiry dismissal,
live stock/sales writes, or reassignment retry/rollback tests were run because
no reassignment is authorized or applied yet. Previous passing browser and
migration results in the historical report are not new-target verification.
No seed, reset, restore, retirement or migration-apply command was run for the
new target. No new backup was required for these read-only operations. Only this
documentation file was edited; the production build refreshed generated `dist`
artifacts. Application sources, environment files and database records were not
modified for this request.

---

# Demo consolidation into noushik@gmail.com

Task date: 2026-10-10. Work is confined to SIM_P2. The historical Grocery-only
transfer to another real account is documented below and is not reversed.

## Verified destination and scope

The normal User model lookup verified existing `noushik@gmail.com`, User ID
`6ac9c7708f22f0222f37f6d0`, name Yaramatti Noushik, default type MEDICAL.
Its four existing Store memberships are:

| Type | Existing Store ID |
| --- | --- |
| Medical | `6ac9c7718f22f0222f37f6d2` |
| Restaurant | `6ac9c7718f22f0222f37f6d4` |
| Grocery | `6ac9c7718f22f0222f37f6d6` |
| Clothing | `6ac9c7718f22f0222f37f6d8` |

No account, password, role, membership, schema, authentication or prediction formula
change is needed. All five destination inventory collections were empty at the
read-only inspection. Existing records belonging to any real account are preserved.

Both `sim-p2-demo-v1:local` and `sim-p2-demo-v1:presentation` were inspected against
their exact seed manifests and dedicated identity definitions. The user explicitly
selected **migrate both remaining datasets; consolidate equivalent products and
suppliers and preserve all stock and sales history**. Seven manifest-verified
dedicated accounts hold the remaining inventory. The eighth, `demo.grocery@example.com`,
has already transferred its inventory to `yaramattiyashu13@gmail.com`; those records
stay with that real user. Its empty demo account is retained because the older
ownership rollback requires the original source identity.

## Expected records before live operations

| Category | Remaining source documents | Destination documents | Redundant documents consolidated |
| --- | ---: | ---: | ---: |
| Products | 84 | 48 | 36 |
| Suppliers | 21 | 12 | 9 |
| Sales | 1,504 | 1,504 | 0 |
| Stock movements | 1,588 | 1,588 | 0 |
| Stored expiry events | 30 | 18 | 12 |

Each type ends with 12 products and three suppliers. Medical and Restaurant retain
428 sales and 452 movements each; Grocery retains 214 sales and 226 movements;
Clothing retains 434 sales and 458 movements. Both histories for equivalent
products remain separate transactions with original sale/movement IDs and dates.

## Conflict, history and presentation handling

Only source products with the same normalized SKU and identical business attributes
(including prices, type, fashion, expiry, category, description and canonical
supplier) consolidate. Source quantities are added; the earliest creation date
is retained. Only equivalent suppliers consolidate. Conflicting attributes or
target SKU/supplier-name collisions refuse the entire transaction. Existing target
records are never adopted, overwritten or silently merged. Source quantity and
sale-linked movement balances are checked before transfer and afterward.

Source historical references are redirected to the canonical product and supplier
IDs under the matching existing destination Store. Sale quantities, amounts, dates,
IDs and linked movement reasons are retained. Clothing variant descriptions and
Old Fashion/New Fashion fields are retained; Clothing has no expiry alerts.

Duplicate expiry events become one event per canonical product/date. A dismissal
in either source remains dismissed, using the earliest dismissal date. All original
events and their distinct saved recommendations remain in the protected snapshot.
Consolidated estimates are recalculated using the unchanged `salesBasis` and
`basisExplanation` functions over the combined actual history. Their source is
APPLICATION, with NO_DATA or UNAVAILABLE state; an old Gemini success is never
reused for different inputs. No Gemini call is needed for migration. Normal worker
retry behavior remains unchanged.

The actual React source has no demo banner, badge, sample-data notice or demo-only
navigation control. Visible labels originate from the seeded records. The transfer
removes `[DEMO]` names/SKU prefixes, generated synthetic-history descriptions,
placeholder supplier contact/company/address text and opening-stock presentation
reasons. Clothing size/color variant text is kept. No React UI file changes are
necessary. Useful stock/expiry labels and AI fallback explanations stay intact.

## Verified backup and selective recovery

Encrypted BSON snapshot:
`backend/backups/noushik-demo-transfer-2026-10-10.dpapi.json`.
Payload SHA-256:
`bfa8b0de73006cdf22f0f1697ab041b90e31db95056366d4b44e8929803caee6`.
Windows DPAPI protects it for this Windows account. Round-trip decryption and
restoration of documents and indexes succeeded on a random marker-owned database,
which was then removed. The snapshot contains 20 Users, 25 Stores, 102 Products,
28 Suppliers, 1,721 Sales, 1,821 StockTransactions, 37 ExpiryAlerts, two demo manifests
and the two prior migration audit documents.

Run the following only from SIM_P2/backend. API/workers must be stopped during
deliberate recovery. No whole-database restore should discard later application
writes.

```powershell
npm run migrate:demo-transfer -- plan --target-id=6ac9c7708f22f0222f37f6d0
npm run migrate:demo-transfer -- apply --target-id=6ac9c7708f22f0222f37f6d0 --backup=backups/noushik-demo-transfer-2026-10-10.dpapi.json --backup-hash=bfa8b0de73006cdf22f0f1697ab041b90e31db95056366d4b44e8929803caee6
npm run migrate:demo-transfer -- verify --target-id=6ac9c7708f22f0222f37f6d0
node migrations/verifyDemoTransfer.js backups/noushik-demo-transfer-2026-10-10.dpapi.json 6ac9c7708f22f0222f37f6d0
```

The `inventorymigrations/demo-consolidation-to:6ac9c7708f22f0222f37f6d0` audit tracks
every changed/removed record with exact before/after hashes. Repeat application
verifies ownership and relationships without reseeding or duplicating records.
Both seed namespaces' lifecycle commands are guarded after transfer.

Selective rollback command, only when its safeguards permit recovery:

```powershell
npm run migrate:demo-transfer -- rollback --target-id=6ac9c7708f22f0222f37f6d0 --backup=backups/noushik-demo-transfer-2026-10-10.dpapi.json --backup-hash=bfa8b0de73006cdf22f0f1697ab041b90e31db95056366d4b44e8929803caee6
```

Rollback refuses changed migrated documents, new dependent transactions/products,
changed target/source identities or conflicting recovered accounts. If retirement
ran, it restores only the verified dedicated users/stores from the encrypted
snapshot along with the exact original inventory records. It never assigns demo
credentials to the destination user. It marks the audit ROLLED_BACK and refuses
automatic reapplication. Later worker recommendation changes also correctly cause
refusal; reconcile those records without discarding later data. Unrelated target
records and metadata are preserved.

## Current execution status

Live transactional transfer succeeded with the planned counts, and repeated
application returned `repeated: true` without duplicate records. The preservation
utility compared all 3,758 original documents to the protected backup. Before
retirement, 531 unaffected documents were exactly unchanged, 3,170 transferred
canonical records matched their after-state hashes, and 57 redundant documents
were consolidated with their before-images retained in the backup.

Live API/UI verification succeeded for all four Stores and all seven destinations.
Each Store returns 12 distinct products and three suppliers; per-store sales and
movement totals match the table above. Dashboard counts, inventory tables, three
report charts, real rule-based recommendations, and absence of rendered demo
labels were checked. Medical, Restaurant and Grocery each show five current
upcoming warnings; Clothing shows none. Foreign Store IDs return 404. Browser
errors: zero. Layout checks at 375 x 812, 768 x 1024 and 1440 x 900 showed no
horizontal overflow on the checked AI pages. Seven routes were checked at desktop.

These live browser checks used a short-lived signed JWT through the unchanged
authentication middleware. The user's actual password was not requested, read,
changed or tested. All target User fields/password hash remain exactly unchanged;
normal login using existing credentials was exercised on the isolated migration
account. Successful live Gemini calls were not tested; actual deterministic
calculations and fallback UI were verified with workers/provider disabled.

After these checks, `retire` transactionally removed **seven** exact manifest-proven
dedicated Users and their now-empty Stores. It verifies unchanged identity hashes
and refuses any remaining records or additional memberships before deletion.
Post-retirement verification found 517 remaining unaffected original documents
unchanged, 3,170 audited transferred records, 57 consolidated duplicates and only
14 expected retired User/Store documents. Target credentials, memberships and
real users' data remain intact. The prior presentation Grocery demo account was
retained for the older transfer's recovery audit. Original demo manifests and
encrypted local credential vaults are retained, guarded against reseeding/reset/
cleanup; they were not decrypted or overwritten by this transfer.

The isolated end-to-end migration test passed in 2.7 minutes. It covers preserved
pre-existing target inventory, collision refusal, consolidated quantities and
history, sticky dismissal, actual seven-day estimates, no-sales/Clothing behavior,
normal login, all four stores/seven routes, foreign access rejection, an empty new
account, guarded lifecycle, repeat transfer/retirement, retirement of seven exact
accounts, rollback refusal after a new sale, and exact positive recovery including
the deleted demo accounts. Its first attempt failed before setup because the test
serialized its circular cleanup fixture; the registration payload was corrected.
The live browser QA helper initially used a missing bundled Chromium; it now uses
the project's configured installed Chrome. Neither issue required an application
or data fix. Completed isolated test invocations removed their own databases; no
rollback ran on the application database. A later full-suite invocation was
interrupted before its final result/cleanup could be confirmed. It is not counted
as passed, and no unidentified database was deleted. The full suite is rerunning
with output saved to `backend/test-results/noushik-full-browser-suite.log`.

A follow-up read-only audit after runtime activity found zero changes to unrelated
original documents, products, suppliers, sales or stock movements. Eight transferred
expiry recommendation caches had progressed through the existing worker states
(including READY/GEMINI and UNAVAILABLE/APPLICATION). Their owners/stores remain
correct. Consequently the strict immediate-after-state preservation check now
refuses those changed cache hashes, as designed; they were not reset to make the
check pass. The successful exact post-retirement comparison above was performed
before that worker activity. Current selective rollback also requires reconciling
these later cache changes and preserving their results.

A second encrypted completion checkpoint was created and its full document/index
restoration verified on an isolated database:
`backend/backups/noushik-demo-completed-2026-10-10.dpapi.json`, SHA-256
`33f23eb8661752f05b1bfd847574d9e5439e4620ad1d57c8bb2459d496019c0f`.
It captures the consolidated inventory and newer worker results: 13 Users, 18
Stores, 66 Products, 19 Suppliers, 1,721 Sales, 1,821 StockTransactions, 25 alerts,
two manifests and three migration audits. This is a completion recovery checkpoint;
the earlier pre-transfer snapshot remains necessary for guarded selective reversal.
Neither snapshot was restored onto the live application database.

| Command actually run | Result |
| --- | --- |
| Backend `npm test` after new migration/guard tests | 89 passed, zero failed/skipped. |
| Frontend `npm run build` | Passed, 80 modules; existing CSS/JS bundle hashes retained. |
| `npm run test:browser:offline -- tests/multi-store.spec.js tests/auth-validation.spec.js tests/store-types.spec.js tests/sales-reports-ai-ui.spec.js` | 29 passed in 2.2 minutes. |
| `SIM_READ_ONLY_VERIFICATION=1`, then `npm run test:browser:offline -- tests/demo-transfer.spec.js` | One end-to-end migration test passed in 2.7 minutes after the fixture correction. |
| Backup command / live plan / apply / repeat / retire / preservation checks | Successful verified restoration, planned transfer/consolidation, no duplicates on retry, seven safe retirements, exact unrelated-record preservation. |
| `SIM_READ_ONLY_VERIFICATION=1`, then `node migrations/verifyDemoTransferUi.js` against verification API | Passed; live report under `backend/test-results/noushik-live-verification.json`. |
| Full `npm run test:browser:offline` after adding fixture cleanup and attribute-conflict coverage | 76 executed: 74 passed, two failed, in 14.8 minutes. The invocation removed its isolated database. The complete output is saved in `backend/test-results/noushik-full-browser-suite.log`. |

The full run's two failures were the existing visual matrix's 15-second Products
row-loading assertion (the later failure snapshot had all expected records, with
no console/API errors), and the existing presentation cleanup's whole-database
snapshot equality check, which observed one additional User while all original
User hashes were unchanged. The cleanup correctly retained that additional user;
no unexpected user was deleted to make the assertion pass. These tests were
retried unchanged on fresh isolated data. Presentation CLI then passed in 57.8
seconds, including retrieval/reset/cleanup and unchanged unrelated records. The
visual retry exercised its pages but recorded session-context errors during two
Vite hot reloads. The Vite log identifies `apiContract.js` filesystem changes
invalidating `session.jsx` at 12:58:08 and 12:58:10 (local client time). Those
concurrent source changes were left intact; no authentication or UI code was
rewritten to mask the failures. A fresh production build passed with the same
80 modules and bundle hashes, and the visual matrix was checked against
Vite preview to avoid hot reload during verification. The production visual matrix
passed unchanged (one test, 1.4 minutes), covering all seven pages, four store types,
public routes, dialogs and all three requested screen sizes. Its invocation removed
its isolated database. The updated consolidation
test passed in the full run, including
conflicting source attributes, fixture cleanup, retirement and recovery.

Final focused retries: presentation CLI **passed**, and production visual matrix
**passed**. Thus every case from the 76-test set has a passing execution across the
full run and focused retries. The full run itself remains **74 passed / two failed**;
it was not rerun as a clean 76-test execution. Retry outputs are retained in
`backend/test-results/noushik-browser-targeted-retry.log` and
`backend/test-results/noushik-production-visual-suite.log`. The targeted development
retry contained one passing presentation test and one visual failure during hot
reload; the subsequent production visual check passed without changing application
code. Normal Vite development/API servers are restored on ports 5500/5000, and
both final health requests returned HTTP 200. The normal expiry provider returned
503 for one event after restart; the existing service retained its application
sales estimate and unavailable/retry state. This provider response was not fixed
by modifying integration logic or fabricating a success.

Remaining limitations: the user's actual password login awaits their private use;
no successful paid/live Gemini request was made. Preserved historical seed records
remain their original history, with no new fabricated sales or changed dates.
Selective rollback deliberately refuses later edits/dependencies and does not
discard live activity. The previous Grocery recipient's records remain untouched.

## Files for this task

- New `backend/migrations/demoTransfer.js`, `demoTransferCli.js`,
  `verifyDemoTransfer.js`, `verifyDemoTransferUi.js`: guarded plan, transactional transfer/consolidation,
  verification, repeat execution, retirement and selective recovery.
- `backend/migrations/guard.js`: protect datasets listed by a multi-dataset audit.
- `backend/package.json`: explicit `migrate:demo-transfer` command; no dependencies.
- New `backend/tests/demoTransfer.test.js` and `frontend/tests/demo-transfer.spec.js`.
- This report. No React UI, API controller, authentication, schema, environment,
  provider or business calculation changes.

---

# Historical Grocery inventory migration results and recovery

Completed on 2026-10-10 (Asia/Calcutta), inside
`C:\Users\Dell\OneDrive\Desktop\SIM_P2`.

## Result and authorized scope

The user chose **keep the current architecture and migrate Grocery only** after
reviewing the separate multi-store design. No Store model, store selector, admin
role, authentication change or architecture change was implemented.

Target: `yaramattiyashu13@gmail.com`, verified existing User ID
`6ac91488a1321476acb6c897`, current type `GROCERY`. The actual schema has no
administrator role. The account's ID, name, shop name, password hash and every
other User field are unchanged. Its inventory was empty immediately before transfer.

Source: `demo.grocery@example.com`, User ID `6ac91ba8d385c9dd0949781d`, from
`sim-p2-demo-v1:presentation` (seed date 2026-10-09). Ownership was reassigned
transactionally with no copies and no duplicate sales.

| Entity | Migrated | Target total after migration |
| --- | ---: | ---: |
| Products | 12 | 12 |
| Suppliers | 3 | 3 |
| Sales | 214 | 214 |
| Stock movements | 226 | 226 |
| Stored expiry alerts | 6 | 6 |

**461 records transferred; zero skipped/conflicting records and zero copies.**
One `inventorymigrations` audit document was added with exact IDs, before/after
hashes, source/target ownership, backup reference and counts. Inventory schemas,
API contracts, routes, calculations and React application source remain unchanged.

## Source accounts retained

The other three presentation stores were outside the approved Grocery scope:

| Store | User ID | Products | Suppliers | Sales | Movements | Stored alerts |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Medical | 6ac91ba2d385c9dd094972bf | 12 | 3 | 214 | 226 | 6 |
| Restaurant | 6ac91ba5d385c9dd0949756e | 12 | 3 | 214 | 226 | 6 |
| Clothing | 6ac91babd385c9dd09497acc | 12 | 3 | 217 | 229 | 0 |

The four older local store accounts and their data also remain intact:
Medical `6ac8a3c930da67778270befe`, Restaurant `6ac8a3ca30da67778270c1ad`,
Grocery `6ac8a3cc30da67778270c45c`, Clothing `6ac8a3cd30da67778270c70b`.
The older local and presentation Grocery sets share 12 SKU patterns; they were
not combined, so their equivalent histories were not counted twice.

The emptied presentation Grocery account is retained. The shared four-owner
manifest and encrypted credential lifecycle still refer to its original identity,
and the verified selective rollback requires the original user documents to remain
available. No users were deleted or disabled and no credentials were copied or reset.
All **17 original User documents** were verified unchanged.

## Relationships and presentation fields

Every product, supplier, sale, movement and alert keeps its original `_id`.
Supplier links, sales-to-product links and `Sale <id>` movement reasons remain
intact. Quantities, prices, totals, sales dates, expiry dates, fashion values,
timestamps, recommendation estimates/status and dismissal state were preserved.

Only transferred records received these presentation-field changes:

- Product `[DEMO]` prefixes removed; `DEMO-GROCERY-01` through `12` became
  `GROCERY-01` through `12`, after checking uniqueness.
- Exact sample-only product descriptions cleared. Ordinary product names remain.
- Supplier names became `Grocery Supplier 1` through `3`; sample company/contact/
  address placeholders were cleared. No real supplier identity/contact was invented.
- Exact sample opening-stock reasons became `Opening inventory`.

There were no hardcoded demo controls/banners in `frontend/src`; the visible text
came from record values. **No UI code or styling changed.** All seven target pages
were inspected through the rendered application and contain no Demo/Sample Data text.
Normal warnings, validation messages and honest AI fallback explanations remain.

The source manifest remains unchanged as historical tracking. New lifecycle guards
refuse presentation seeding, credential display/reset and cleanup after a transfer;
those whole-dataset commands must not reset or delete the receiving account's data.
This also means those presentation CLI commands are unavailable for the remaining
three source identities until their lifecycle tooling is redesigned. Their existing
credentials/vault and ordinary login functionality are unchanged. The older local
dataset commands remain outside this guard's presentation scope.

## Backup and verified recovery

Encrypted backup:
`C:\Users\Dell\OneDrive\Desktop\SIM_P2\backend\backups\grocery-transfer-2026-10-10.dpapi.json`.

Payload SHA-256:
`1aaec7b57b22e43ee8df27fc7d00de6d30ad643efc42a6e8363663f34ca81e64`.

The backup contains 3,726 documents from all seven original collections plus their
collection/index definitions. BSON preserves ObjectIds and dates. Windows DPAPI
encrypts the complete payload; only the original Windows account can decrypt it.
No plaintext password/backup file or connection string was saved. `backend/backups/`
is ignored by Git. The existing credential files and environment configuration were
not changed.

Before the live transfer, the backup was decrypted/checksummed and restored into
an invocation-owned, randomly named isolated MongoDB database. Every document and
index was compared successfully; that test database was removed after verification.
The application database was never dropped/reset. The API and its watcher were
stopped during backup and transfer, preventing background-worker/writer races.

Run commands from `C:\Users\Dell\OneDrive\Desktop\SIM_P2\backend`:

```powershell
npm run migrate:grocery -- verify-backup --backup=backups/grocery-transfer-2026-10-10.dpapi.json

npm run migrate:grocery -- plan --target-id=6ac91488a1321476acb6c897

npm run migrate:grocery -- apply --target-id=6ac91488a1321476acb6c897 --backup=backups/grocery-transfer-2026-10-10.dpapi.json --backup-hash=1aaec7b57b22e43ee8df27fc7d00de6d30ad643efc42a6e8363663f34ca81e64
```

The live apply was run twice; the second returned `repeated: true` and inserted
or reset nothing. Existing target data is never deleted to resolve a collision.
Future source/target changes, SKU/name conflicts, missing/untracked records,
foreign references, active expiry leases or inconsistent stock cause refusal.
The command is explicitly development-only, not part of application startup.

For recovery **only when deliberately rolling back**, stop the API/watcher and
use the same Windows account:

```powershell
npm run migrate:grocery -- rollback --target-id=6ac91488a1321476acb6c897 --backup=backups/grocery-transfer-2026-10-10.dpapi.json --backup-hash=1aaec7b57b22e43ee8df27fc7d00de6d30ad643efc42a6e8363663f34ca81e64
npm run dev
```

Selective rollback restores only the exact audited 461 records to their original
source owner/field values in one transaction. It preserves unrelated target data
and User documents. It checks backup hashes, original users, after-state hashes
and new product/supplier dependencies before writing. Edited records or new
dependent sales/movements/alerts cause refusal; reconcile them manually instead
of discarding data. An applied audit becomes `ROLLED_BACK`, and automatic
reapplication is refused. Positive rollback and refusal after new transactions
were exercised in an isolated test database. No rollback ran on the application DB.

## Actual verification

- All 3,265 unaffected original documents match the backup. All 461 transferred
  records preserve their original business/relationship fields except the approved
  ownership and presentation fields. Collection record totals did not change.
- Real target authenticated APIs return 12 products, 3 suppliers, 214 sales and
  226 movements. Opening stock minus movements balances with current quantities.
- The target renders Dashboard, Products, Suppliers, Inventory, Sales, Reports
  and AI Recommendations without presentation labels, console or JavaScript errors.
  Reports display their existing three charts; normal history pagination still applies.
- Five upcoming expiry warnings were visible during verification. All six stored
  events and original dates/dismissals remain; the 2026-10-09 event is already expired
  under the existing UTC rules and correctly excluded from upcoming warnings.
- No-sales Fresh Paneer retains the null replacement estimate. Current manual
  fallback advice includes Rice 241 units, Juice 77 and Cooking Oil 69, calculated
  from the current historical window. No formula or historical date was changed.
- Source Grocery now lists zero products; Medical still lists its own 12. Both
  accounts receive 404 for target product IDs. Isolated tests also verified empty
  new accounts and denials for product edits, suppliers, sales, stock, reports and AI.
- Real-account API/UI checks used a short-lived signed JWT through the existing
  authentication middleware without changing the User. **The user independently
  confirmed that normal login with the existing password works and 12 products
  appear.** The agent did not read or reset that password. Normal password login,
  existing hash/session preservation and logout were verified on isolated accounts.
- AI-page width checks passed at 375x812 and 768x1024; desktop route checks used
  1440x900. No layout or CSS changes were necessary.
- Application-db checks used the existing verification helper with workers/live
  Gemini calls disabled. Normal `npm run dev` was restored afterward. Live Gemini
  success was not tested; actual fallback calculations were verified without paid calls.

| Command | Actual result |
| --- | --- |
| Backend `npm test` | 70 passed, 0 failed, 0 skipped |
| Frontend `npm run build` | Passed, 79 modules; existing CSS/JS asset hashes unchanged |
| `npm run test:browser:offline -- tests/grocery-migration.spec.js tests/migration.spec.js tests/auth-validation.spec.js` | 9 existing tests passed; new test initially failed because it used POST instead of the existing PATCH dismissal route |
| Targeted retry after correcting that test | One attempt stopped before tests with a MongoDB connection timeout; subsequent `tests/grocery-migration.spec.js` run passed (1 test, 4 minutes) |
| Backup command and live `apply`/repeat | Verified restore succeeded; 461 reassigned; repeat made no duplicates |

The migration browser test covers preserved pre-existing target records, normal
login, CRUD/stock/sales behavior, report/AI pages, no-sales/dismissal semantics,
cross-account denials, empty new users, collision refusal, encrypted backup recovery,
guarded demo lifecycle, repeat execution and selective rollback. Invocation-owned
test databases were removed. Prior task results are not claimed as migration evidence.

## Files changed

- `.gitignore`: ignore encrypted backup directory.
- `backend/package.json`: explicit `migrate:grocery` command; no dependencies added.
- New `backend/migrations/backup.js`, `guard.js`, `grocery.js`, `cli.js`.
- `backend/demo/seed.js` and `presentation.js`: protect transferred records from
  the old whole-dataset lifecycle commands before touching credential files.
- New `backend/tests/groceryMigration.test.js` and
  `frontend/tests/grocery-migration.spec.js`.
- This report. The subsequent multi-store feature is tracked separately in
  `MULTI_STORE_IMPLEMENTATION.md`; the Grocery transfer itself did not change architecture.

Ignored runtime artifacts include the encrypted backup and verification reports/
screenshots under test-results. No React application file, backend controller/model,
prediction domain/service, API route, authentication or environment file was changed.
