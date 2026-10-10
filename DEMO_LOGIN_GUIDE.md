# Shop Inventory Manager presentation demo

Project: `C:\Users\Dell\OneDrive\Desktop\SIM_P2`.

This is a separate, explicitly seeded **presentation** dataset. Existing users,
inventory, and the older `local` demo remain intact. No frontend, production
startup, database schema, authentication flow or prediction algorithm is changed.

## Seed and start

Stop the API first, including any `npm run dev` watcher. From a private local terminal:

```powershell
Set-Location 'C:\Users\Dell\OneDrive\Desktop\SIM_P2\backend'
npm run seed:demo:presentation
npm start
```

The command uses the existing `backend/.env` database connection and requires its
existing MongoDB transaction support. It refuses `NODE_ENV=production`. It is never
called by normal application startup. The first run prints generated credentials
once after successful creation. Repeating the seed preserves accounts, passwords,
inventory edits, history and dismissal state; it does not make duplicates or advance
the dataset's dates. A pre-existing demo email without its exact manifest causes
an atomic refusal, rather than adoption or overwrite.

Start the frontend in a second terminal if it is not already running:

```powershell
Set-Location 'C:\Users\Dell\OneDrive\Desktop\SIM_P2\frontend'
npm run dev
```

- Frontend/login: http://localhost:5500/login
- Backend: http://localhost:5000/api
- API health: http://localhost:5000/api/health

## Demo accounts and private credentials

| Store | Email |
| --- | --- |
| Medical | `demo.medical@example.com` |
| Restaurant | `demo.restaurant@example.com` |
| Grocery | `demo.grocery@example.com` |
| Clothing | `demo.clothing@example.com` |

These are placeholder addresses, not real inboxes. The application has no email
ownership-verification or delivery flow; the seed does not mark them as verified.

Each account gets a different password containing 24 cryptographically random
bytes plus characters guaranteeing the current uppercase/lowercase/digit/punctuation
policy. The normal User model hashes passwords with its existing bcrypt hook.
Neither the guide nor source files contain actual passwords.

The new `backend/.demo-presentation.local.json` stores **Windows DPAPI ciphertext**,
not plaintext passwords. It and its temporary files are ignored by Git. Only the
Windows account that created the vault can decrypt it on that computer. The older
local demo credential file is separate and is not used for these accounts.

To retrieve the four passwords, privately, using the same Windows account:

```powershell
Set-Location 'C:\Users\Dell\OneDrive\Desktop\SIM_P2\backend'
npm run demo:credentials
```

Copy the output into your password manager before presenting. Do not screen-share,
commit, paste into chat or save the command's plaintext output. Seed repetition
does not redisplay passwords automatically; this retrieval command displays them
only when explicitly requested. No public credential endpoint was added.

To generate replacement passwords for only the four manifest-verified
presentation accounts:

```powershell
npm run demo:reset-passwords
```

The reset uses the normal hashing hook and an atomic database transaction. It
preserves user IDs, store types, products, suppliers, sales, stock and alerts. The
new passwords are printed once and saved encrypted. It also supports a lost vault
or a move to another Windows account, provided the original tracked presentation
accounts still exist. Existing application session behavior remains unchanged;
log out and use the new password for your next login.

An encrypted pending/current pair allows the credential command to recover an
interrupted password reset by comparing candidates against the actual hashes.
It never guesses a password or silently overwrites an unrelated credential file.
Unrecognized/corrupt files are refused; restore a trusted vault backup rather than
using a force-overwrite option. This encrypted credential mechanism requires Windows.

## Data available immediately

| Store | Products | Suppliers | Sales | Stock movements | Initial expiry warnings |
| --- | ---: | ---: | ---: | ---: | ---: |
| Medical | 12 | 3 | 214 | 226 | 6 |
| Restaurant | 12 | 3 | 214 | 226 | 6 |
| Grocery | 12 | 3 | 214 | 226 | 6 |
| Clothing | 12 | 3 | 217 | 229 | 0 |

Sales span the previous 30 UTC calendar days, including today. Each product has
an opening Stock In and a matching Stock Out for each sale. Opening stock minus
sold units equals the displayed current stock; totals use the actual selling price.
The dataset is deliberately marked `[DEMO]`/`DEMO-*` and tracked by exact IDs in
the existing `demodatasets` collection.

Medical includes tablets, cough syrup, antacids, vitamins, bandages and antiseptic
supplies. Restaurant includes milk, vegetables, cheese, bread, rice, flour, sauces,
spices and cooking oil. Grocery includes milk, snacks, juice, biscuits, rice, flour,
sugar, detergent and daily essentials. Restaurant history uses the application's
existing product-sales model; it does not invent a recipe or ingredient-usage system.

Clothing includes T-shirts, jeans, shirts, dresses, jackets and trousers, with six
Old Fashion and six New Fashion products. Expiry is always null and no expiry alerts
are created. The model has no separate size/color fields; variants are described
in the existing description field.

## Suggested presentation walkthrough

1. Open `/login`, copy the selected account's email and privately retrieved password,
   and log in. The store is already selected. Dashboard cards and charts use real
   API records for that retailer.
2. Open **Products**, **Suppliers**, and **Inventory** to show product details,
   linked suppliers, low-stock badges and recorded movements. Existing limits mean
   the inventory screen loads its normal 200 latest movements; the full seed remains
   stored and the API supports requesting up to 500.
3. Open **Sales** and **Reports**. Show historical sales, search/date filters,
   calendar summaries and product performance. These are actual stored sample sales,
   not hardcoded dashboard numbers. Sales/report history loads up to 500 records.
4. Open **AI Recommendations** and generate recommendations. Explain the displayed
   source honestly: a configured Gemini response may succeed, or the real deterministic
   fallback may be shown. The seed does not insert recommendation rows or successful
   Gemini output.
5. Log out and repeat for another retailer. Each account sees its own records.
   For Clothing, show the Old Fashion/New Fashion filters and absence of expiry UI.

For each store, the SKU prefix is `DEMO-MEDICAL`, `DEMO-RESTAURANT`,
`DEMO-GROCERY` or `DEMO-CLOTHING`. The last two digits identify scenarios:

| Suffix | Demand demonstration | Expiry for applicable stores |
| --- | --- | --- |
| `01` | Fast-moving with low current stock | Today |
| `02` | Demand rises from 1 to 2 to 6 units/day | Tomorrow |
| `03` | Stable demand of 3 units/day | In two days |
| `04` | Slow-moving: three isolated one-unit sales | Tomorrow |
| `05` | No sales: no numerical expiry estimate | In two days |
| `06` | One recent sale: limited-evidence caution | In two days |
| `07` | Fast demand and low stock; useful manual reorder example | In 30 days |
| `08` | Stable demand and ample stock | Later |
| `09` | Slow demand | Later |
| `10` | No sales and sufficient stock; no fabricated reorder advice | No expiry |
| `11` | Rising demand and low stock | Later |
| `12` | Already expired batch, or out-of-stock Clothing item | Yesterday, except Clothing |

Specific examples:

- Medical: Paracetamol (`01`), Cough Syrup (`02`), Antacid Tablets (`03`), Vitamins
  (`04`), Bandages with no sales (`05`), Oral Rehydration Salts (`07`).
- Restaurant: Milk (`01`), Vegetables (`02`), Cheese (`03`), Bread (`04`), Fresh
  Sauce with no sales (`05`), Rice (`07`).
- Grocery: Milk (`01`), Packaged Snacks (`02`), Juice (`03`), Biscuits (`04`), Fresh
  Paneer with no sales (`05`), Rice (`07`).
- Clothing: T-shirts (`01`), Jeans (`02`), Shirts (`03`), Dresses (`04`), Jackets
  with no sales (`05`), Polo Shirts (`07`); all omit expiry.

The six warning products cover UTC today, tomorrow and two days ahead. Later,
missing and already-expired dates are excluded from upcoming warnings. The normal
Dashboard Expiring metric uses a different 30-day range, so it can show seven while
the warning list shows six. Reports may also include already-expired batches.

## Genuine calculation and provider limits

Initial warnings are processed by the real expiry engine. Its estimate remains
`ceil(recorded units / observation days × 7)`; no-sales quantity remains null and
limited history retains its caution. Initial preparation deliberately supplies an
unavailable-provider adapter, so calculations are available without a paid Gemini
call and explanations honestly show application fallback/unavailable status.

Manual reorder advice retains the separate existing 30-day demand/minimum-stock/
days-cover rules. For example, later-expiry fast-moving SKU `07` is suitable for
showing manual reorder advice. It is not the seven-day expiry replacement estimate.
Live provider availability/quota cannot be guaranteed; the existing structured-output
validation, cooldown, retries, timeout and fallback remain unchanged.

Normal startup can retry an unavailable explanation after the existing retry delay,
within its existing attempt limit. Products expiring today can appear in calendar-day
warnings while being blocked from sales/manual advice by the existing expiry-instant
rule. This behavior was preserved.

Dates are relative to the first seed day. Reseeding preserves records instead of
moving their expiry dates. For a presentation on a later day, the explicit cleanup
and seed commands below can recreate only the untouched tracked presentation set.

## Optional, strictly scoped cleanup

Stop the backend and avoid writes to presentation accounts first:

```powershell
npm run cleanup:demo:presentation
npm run seed:demo:presentation
npm start
```

Cleanup verifies the exact presentation manifest, IDs, identities, ownership and
relationships before deleting only tracked presentation records and their derived
alerts. It refuses if untracked records or foreign references exist. Existing real
records and the older local demo are outside its scope. There is no force option.
No cleanup of presentation data was performed on the application database during
setup. The encrypted credential file is retained for reuse.

## Setup verification

Verified on 2026-10-09 against the configured application database:

- Created all four presentation retailers with the counts above. All four logged
  in and logged out through the existing React frontend.
- Loaded all seven navigation destinations for each account; checked product,
  supplier, inventory and sales rows, Dashboard totals, Reports charts and actual
  recommendation cards. Browser console and JavaScript error lists were empty.
- Stock movements balance with current product quantities. Cross-retailer product
  requests return 404. Clothing has six products in each fashion category, no expiry
  values, no expiry form field and no expiry warnings. Applicable stores retain
  optional expiry fields and six upcoming warnings.
- The existing expiry engine returned seven-day quantities of 55, 17, 21, 1,
  null and 1 for scenarios `01` through `06`. Scenario `05` remains `NO_DATA`;
  the others honestly report unavailable Gemini explanations. Manual reorder
  scenario `07` returned 249 using the existing rule-based calculation.
- Hash comparisons confirmed all 1,876 original documents unchanged after setup.
  Repeated seeding and read-only browser verification left all 3,725 resulting
  documents unchanged. No application-database cleanup or password reset ran.
- Source hashes confirmed no frontend application code, backend controllers,
  models, domain calculations, services or authentication implementation changed.

Commands actually run:

| Command / location | Result |
| --- | --- |
| `npm run seed:demo:presentation` in `backend` | Created the four accounts; a second run preserved every record and created no duplicates |
| `npm test` in `backend` | 67 passed, 0 failed, 0 skipped, including real Windows DPAPI round-trip tests |
| `npm run test:browser:offline -- tests/presentation-demo.spec.js tests/demo-data.spec.js tests/migration.spec.js` in `backend` | 11 passed; invocation-owned test database removed |
| `npm run build` in `frontend` | Passed; 79 modules transformed |

Automated tests exercised seeding, repetition, secure credential retrieval, password
reset with old-password rejection, cleanup, collision rollback, production refusal,
four-store validation, retailer isolation, stock balances and real prediction/fallback
states. Write/reset/cleanup checks used invocation-owned test databases, not the
existing application database. Application-database browser checks used the existing
verification helper with background workers disabled and no live Gemini key; normal
API startup was restored afterwards. Live Gemini success and real inbox delivery
were not verified. Dates remain anchored to the seed day as described above.

Changed source/documentation files: `.gitignore`, `DEMO_DATA_GUIDE.md`, this guide,
`backend/package.json`, `backend/demo/data.js`, `backend/demo/seed.js`,
`backend/demo/cli.js`, `backend/demo/presentation.js`,
`backend/demo/presentationCredentials.js`, `backend/tests/presentationDemo.test.js`
and `frontend/tests/presentation-demo.spec.js`. The encrypted local vault is an
ignored runtime file. No dependencies were added.
