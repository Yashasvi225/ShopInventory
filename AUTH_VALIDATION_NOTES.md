# Authentication validation — 2026-10-09

This change is limited to email and password validation in SIM_P2. CycleJournal was not accessed. No dependencies were added.

## Exactly which files changed

| File | Change |
| --- | --- |
| `backend/controllers/authController.js` | Validates registration/login email; applies password strength only to registration; preserves literal passwords during both operations |
| `backend/utils/authValidation.js` | New authentication-specific email, strong-password and nonempty-login-password validation |
| `frontend/src/components/AuthForm.jsx` | Matching client checks, clear native inline validation, registration-only password hint; removes login's old minimum-length restriction |
| `frontend/src/utils/authValidation.js` | New client email/password validation helpers |
| `backend/tests/authValidation.test.js` | Seven focused policy, client/server parity, controller and real bcrypt compatibility tests |
| `backend/tests/hardening.test.js` | Existing 72-byte boundary test now uses strong passwords; rejection test captures validation errors forwarded to the existing error middleware |
| `frontend/tests/auth-validation.spec.js` | Four real browser/API checks for validation, duplicates, literal hashing, existing credentials and sessions |
| `AUTH_VALIDATION_NOTES.md` | This report |

The frontend production build regenerates `frontend/dist`. No other existing source or configuration files were modified: a SHA-256 comparison of 104 baseline files found exactly the three existing-file changes above and no missing files. The remaining listed implementation/test files and this report are new.

## Email validation

Registration and login both reject empty/non-text input, missing parts, multiple `@` signs, internal whitespace, leading/trailing/doubled local-part dots, malformed domain labels, single-label domains and implausible TLD syntax. Common ASCII dot-atom addresses, plus addressing, subdomains and alphabetic TLDs of 2–63 characters are supported. Domain labels are limited to 63 characters, the local part to 64, and the full address to 254.

The error is `Please enter a valid email address.` Leading/trailing whitespace is trimmed and case is normalized to lowercase, matching the application's existing normalization and Mongoose email settings. No existing stored identities are rewritten. Duplicate registration still returns HTTP 409 with `Email already registered`.

This is syntactic validation. It performs no DNS, mailbox-existence or ownership check and makes no claim that a syntactically acceptable address can receive mail. Quoted local parts and internationalized email syntax are outside this conservative ASCII policy.

## Password validation and compatibility

New registrations require at least eight Unicode code points, one uppercase English letter, one lowercase English letter, one digit and one ASCII punctuation character. Spaces alone never satisfy this policy. The existing maximum of 72 UTF-8 bytes is retained because the installed bcrypt implementation considers only that prefix. Both client and server enforce matching rules, including the byte limit.

The registration message is `Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.` The same requirements appear as a hint in the existing form without any CSS or layout changes.

Passwords are never trimmed or transformed. Login checks for a nonempty string and calls the existing bcrypt comparison without registration strength or minimum-length checks. Older weak, short and whitespace-bearing credentials can therefore authenticate against their stored hash. Unknown accounts and incorrect passwords both receive the existing generic `Invalid email or password` HTTP 401 response.

The User schema, bcrypt hashing hook and cost, JWT creation/expiry, authentication middleware, session/storage code, protected routes, API response shapes and error middleware are unchanged. No credential logging was added.

## Email ownership verification

No existing delivery service, verification-token flow or verified-email field was found. Ownership verification remains unimplemented. Genuine verification would require configured email delivery plus expiring confirmation tokens and verification state, with an explicitly designed registration/session flow. Those infrastructure and database changes are outside this task. No fake code, paid service or unconfigured provider dependency was introduced.

## Commands actually run

| Command | Directory | Result |
| --- | --- | --- |
| `npm test` | `backend` | **62 passed**, 0 failed, 0 skipped; includes the seven new authentication checks and all existing backend tests |
| `npm run build` | `frontend` | **Passed**; 79 modules, CSS 33.86 kB (6.97 kB gzip), JavaScript 475.33 kB (156.63 kB gzip) |
| `npm run test:browser:offline -- tests/auth-validation.spec.js tests/react-routing.spec.js tests/migration.spec.js` | `backend` | **12 passed**, 0 failed, in 1.5 minutes |

The browser/API run tested the requested valid emails, malformed addresses, missing/weak passwords, normalized duplicates, actual hashed registration, wrong credentials, a literal five-character legacy password containing spaces, login/logout, session persistence, protected/legacy URLs and existing inventory journeys for all four store types. Product, supplier, stock, sales, report and fallback operations were exercised by the existing migration checks without changing their implementation.

Tests used the existing invocation-owned isolated database runner with paid Gemini calls disabled. The actual port-5000 listener was checked to belong to `backend/tests/helpers/offlineServer.js`; the normal API and its watcher were stopped first to avoid a port conflict. The runner removed only its own test database afterward. Existing application users were neither deleted nor reset: a before/after SHA-256 snapshot of the normal database's user records matched exactly, with zero added or removed users.

The normal API was restored using `npm start`. `http://localhost:5000/api/health` returned HTTP 200 and identified the Shop Inventory Manager API; `http://localhost:5500/login` returned HTTP 200. The complete UI browser suite was not repeated for this narrowly scoped change; the relevant 12 checks and full backend suite passed.
