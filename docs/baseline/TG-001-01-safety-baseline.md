# TG-001-01 — Safety Baseline Report

**Issue:** [TG-001-01](https://github.com/p0wder/asp-webapp/issues/114) ·
**Epic:** [EPIC-TG-001 — Production Safety and Live-Mutation Hardening](https://github.com/p0wder/asp-webapp/issues/74) ·
**Priority:** P0 · **Wave 0**

**Status:** Complete except for the archive comparison (see [Open item O1](#o1--reviewed-archive-not-available)).

This report binds implementation to one Git commit and records the observed
state of every Phase 0 safety claim **before** any agent modifies code. It is
append-only evidence: later issues in EPIC-TG-001 should cite it, not rewrite
it. No application code was changed to produce it.

---

## 1. Commit binding

| Field | Value |
|---|---|
| Repository | `p0wder/asp-webapp` |
| Branch | `claude/tg-001-01-epic-vew5du` |
| Commit SHA | `068645e5fc864e27701b7f3bd5b053010ba8f18f` |
| Commit date | 2026-07-22 16:09:44 -0400 |
| Commit subject | Merge pull request #73 from p0wder/claude/ss-activewear-order-shipping-bug-lxx0lg |
| Branch point | Identical to `master` at time of audit (0 divergent commits) |
| Git tree SHA | `7b93d54c9cdd149966492a9d1c991b8b380c6d06` |
| Tracked files | 179 |
| Tracked-manifest SHA-256 | `c06cf683c87b8831e92ed15f62e0d29a9f8c0df6eeb0c835c652445a569f8159` |
| `package-lock.json` SHA-256 | `84e2157a1fbca440866d0d38c77795c62e9647f10280dafea98af55b3a4c339e` |
| Working tree | Clean (0 modifications) at audit time |

The tracked-manifest SHA-256 is reproducible with:

```bash
git ls-files -s | sha256sum
```

### O1 — Reviewed archive not available

**AC1 requires an archive identifier and SHA-256 for `asp-webapp-master.zip`.
That archive is not in the repository and is not present in the audit
environment**, so its SHA-256 could not be computed and a file-level diff
against it could not be performed. The Git identifiers above are supplied as
the binding instead.

This is the one part of AC1 that is not satisfied. It is recorded as open item
**O1** in the [variance register](#7-variance-register) rather than assumed.
Every Phase 0 finding in this report was instead verified **directly against
the code at the commit above**, which is a stronger check than an archive
diff for the findings themselves — but it cannot prove the archive and this
commit are the same tree.

---

## 2. Framework and dependency versions

Resolved from `package-lock.json` (lockfileVersion 3), confirmed by `npm ci`.

| Package | Declared | Resolved |
|---|---|---|
| `next` | 16.1.6 | 16.1.6 |
| `react` / `react-dom` | 19.2.3 | 19.2.3 |
| `@clerk/nextjs` | ^7.4.1 | 7.4.1 |
| `stripe` | ^22.1.1 | 22.1.1 |
| `@vercel/blob` | ^2.3.3 | 2.3.3 |
| `next-auth` | ^4.24.14 | 4.24.14 — **unused, see V5** |
| `bcryptjs` | ^3.0.3 | 3.0.3 — **scripts only, see V5** |
| `react-hook-form` | ^7.72.1 | 7.72.1 |
| `@playwright/test` | ^1.60.0 | 1.60.0 |
| `tailwindcss` / `@tailwindcss/postcss` | ^4 | 4.2.1 |
| `eslint` | ^9 | 9.39.3 |
| `eslint-config-next` | 16.1.6 | 16.1.6 |
| `babel-plugin-react-compiler` | 1.0.0 | 1.0.0 |

Runtime used for this audit: Node v22.22.2, npm 10.9.7. CI pins Node 20.

---

## 3. Route inventory

30 API routes. "Matcher" = covered by an admin entry in `proxy.js`
`config.matcher`; "Handler" = authorization check inside the route handler.
Constitution Principle VII requires **both** layers on admin routes.

### 3.1 Admin routes — both layers present (17)

`requireAdmin()` in-handler **and** a `proxy.js` admin matcher entry:

| Route | Methods |
|---|---|
| `/api/leads` | GET, POST |
| `/api/leads/[id]` | PATCH, DELETE |
| `/api/leads/location-suggest` | GET |
| `/api/leads/scan` | POST |
| `/api/orders-partial-state` | POST |
| `/api/payment-profiles` | GET |
| `/api/place-order` | POST |
| `/api/printavo-customers` | GET |
| `/api/printavo-status-update` | POST |
| `/api/promo-codes` | GET, POST |
| `/api/promo-codes/[id]` | PATCH, DELETE |
| `/api/proof-upload` | POST |
| `/api/quote-status-update` | POST |
| `/api/quotes` | GET |
| `/api/ready-to-order` | GET |
| `/api/ss-catalog-lookup` | POST |

### 3.2 Admin routes — single layer only (1) — **NEW FINDING V2**

| Route | Methods | Matcher | Handler |
|---|---|---|---|
| `/api/search-products` | GET | YES | **NONE** |

Matcher-only protection. Principle VII violation; not recorded in the backlog.

### 3.3 Customer routes (1)

| Route | Methods | Protection |
|---|---|---|
| `/api/my-orders` | GET | Clerk `auth()` in-handler. Page route `/my-orders` is matched by `isProtectedCustomerRoute`; the API path is not in the admin matcher. |

### 3.4 Public / unauthenticated routes (11)

| Route | Methods | Control present | Note |
|---|---|---|---|
| `/api/submit-quote` | POST | Origin guard | 293 lines — largest handler in the repo |
| `/api/upload` | POST | Origin guard | |
| `/api/validate-promo` | POST | Origin guard | |
| `/api/garment-pricing` | GET | Origin guard | |
| `/api/order-status` | GET | HMAC token or Clerk session | |
| `/api/proof` | GET | HMAC token or Clerk session | |
| `/api/proof-decision` | POST | HMAC token or Clerk session | |
| `/api/stripe-webhook` | POST | Stripe signature verification | See F4 |
| `/api/cron/refresh-leads` | GET | `Authorization: Bearer $CRON_SECRET` | Fails closed when unset (500) |
| `/api/create-payment-session` | POST | **None** — no auth, no origin guard | **NEW FINDING V3** |
| `/api/admin-setup` | GET | `?token=$ADMIN_SETUP_TOKEN` | See F6a / V10 |
| `/api/debug-auth` | GET | **None** | See F6b |

Protected **page** routes in `proxy.js`: `/purchasing`, `/pipeline`, `/leads`,
`/dashboard/promo-codes`, `/dashboard/marketing` (admin);
`/my-orders` (customer).

---

## 4. External write paths

Every path that mutates state outside this application.

| # | Path | Entry point | Client module | Live today |
|---|---|---|---|---|
| W1 | S&S Activewear order placement | `POST /api/place-order` → `lib/placeOrderChain.js` | `lib/ssActivewear.js` → `POST https://api.ssactivewear.com/v2/orders/` | **YES — `testOrder: false`** |
| W2 | Printavo payment recording | `POST /api/stripe-webhook` | **inline `gql()` in the route handler** — see V9 | YES |
| W3 | Printavo customer / quote / line-item / imprint / mockup creation | `POST /api/submit-quote` | `lib/printavo.js` (`CreateCustomer`, `CreateQuote`, `CreateGroup`, `CreateLineItem`, `CreateImprint`, `CreateLineItemMockup`, `CreateImprintMockup`, `UpdateLineItemPrice`) | YES |
| W4 | Printavo status transitions | `/api/printavo-status-update`, `/api/quote-status-update`, `placeOrderChain` | `lib/printavo.js` (`SetStatus`, `SetInvoiceStatus`) | YES |
| W5 | Stripe Checkout session creation | `POST /api/create-payment-session` | `lib/stripe.js` | YES |
| W6 | Clerk user role mutation | `GET /api/admin-setup` | `@clerk/nextjs/server` `clerkClient` | YES |
| W7 | Vercel Blob writes (leads, promo codes, proofs, uploads) | `/api/upload`, `/api/proof-upload`, leads & promo routes | `lib/leadsStorage.js`, `lib/promoCodesStorage.js`, `@vercel/blob` | YES |

**None of W1–W7 is behind a kill switch, feature flag, or idempotency key.**

---

## 5. Data stores

| Store | Contents | Durability |
|---|---|---|
| Vercel Blob | Leads JSON (`lib/leadsStorage.js`), promo codes JSON (`lib/promoCodesStorage.js`), uploaded artwork and proofs | Read/modify/write of whole JSON documents; no transactions, no locking |
| Printavo | Customers, quotes, invoices, line items, statuses, payments | System of record, external |
| Browser `localStorage` | Cart (`lib/cartStorage.js`), theme | Per-browser only |

**There is no relational database.** No `postgres`, `prisma`, `drizzle`,
`@neondatabase`, or `pg` dependency exists, and no schema or migration
directory is present. See variance **V1** — this blocks the durable-record
work in TG-001-03 and TG-001-05.

---

## 6. Test baseline

### 6.1 Reproducible commands

```bash
npm ci
npx playwright test --project=chromium --reporter=list   # test suite
npm run lint                                             # lint
npm run build                                            # production build
```

### 6.2 Results at this commit

| Check | Result |
|---|---|
| Playwright, `--project=chromium` | **150 passed, 1 failed** (1.5 min) |
| Tests collected, chromium project | 151 in 15 files |
| Tests collected, all projects (chromium + mobile) | 302 in 15 files |
| `test()` declarations in source | 136 (the rest are generated in `for` loops) |
| Tests skipped / quarantined | **0** — no `test.skip` or `test.fixme` anywhere |
| `npm run build` | **PASS** (exit 0) |
| `npm run lint` | **FAIL** (exit 1) — 18 problems: 16 errors, 2 warnings |

No live external mutation was invoked. Every API test in
`tests/e2e/api.spec.js` posts an empty or invalid body and asserts a non-200
response, so each request is rejected by validation or the origin guard before
reaching Printavo, S&S, or Stripe.

### 6.3 The one failing test — pre-existing, not an application defect

```
tests/e2e/quote-extended.spec.js:242
  Quote form – step 4 (Review & Submit) › shows quantity in order summary
  Error: strict mode violation: getByText(/48/) resolved to 2 elements:
    1) <div>48 qty · Black · 1 ink color</div>
    2) <span>$418.48</span>
```

The assertion `page.getByText(/48/)` is ambiguous: the quantity `48` and the
price `$418.48` both match. This is a defect **in the test**, not in the
application — the order summary renders correctly. It reproduces
deterministically on re-run and exists at this commit on `master`, so it is
the inherited baseline, not a regression introduced here. It is **not** a
flake and must not be treated as one. Tracked as **V11**.

### 6.4 Lint failures at baseline (17 errors, 2 warnings)

| Rule | Count | Files |
|---|---|---|
| `react/no-unescaped-entities` | 14 | `app/contact/page.js`, `app/dashboard/marketing/page.jsx`, `app/order-status/page.jsx`, `app/proof/page.jsx`, `app/purchasing/checkout/page.jsx`, `app/quote/page.jsx` |
| `react-hooks/set-state-in-effect` | 2 | `context/ThemeContext.js` |
| `@next/next/no-img-element` | 1 | `app/dashboard/marketing/page.jsx` |

Lint is **not** currently a CI gate. Adding one without fixing these first
would fail the build immediately — see **V6** and TG-039-01.

### 6.5 Environment note for reproducing the suite

`@playwright/test` 1.60.0 requests Chromium build **1223**. The audit container
ships build **1194**, so a first run failed all 151 tests with
`browserType.launch: Executable doesn't exist`. This is an environment
mismatch, not a code failure. The run above was obtained by pointing the
expected build path at the available binary; no repository file was modified.
Tracked as **V11**.

---

## 7. Phase 0 finding confirmation

Every claim in the EPIC-TG-001 "Current repository state" paragraph, verified
line by line. **Nothing is assumed — each is confirmed or corrected.**

### F1 — `lib/ssActivewear.js` hard-codes `testOrder: false` and logs raw bodies — **CONFIRMED**

`lib/ssActivewear.js:350` sets `testOrder: false` inside `createSSOrder`, with
the in-code comment *"⚠️ LIVE — real orders now place for real. Flipped
intentionally to investigate a shipping-cost discrepancy."* Git history
confirms the flip (`54d35c9 Go live: flip createSSOrder testOrder to false`).

Raw logging confirmed at `lib/ssActivewear.js:374` and `:390`, which
`JSON.stringify` the entire request and response bodies.

**Aggravating detail not in the backlog:** the logged request body includes
`paymentProfile: { profileID, email }` (built at `:283`). The epic's security
floor states *"no secrets, customer tokens, payment profiles or raw vendor
payloads in logs."* All four categories are currently logged. Feeds TG-001-08.

→ Confirms the premise of **TG-001-02**, **TG-001-08**, **TG-001-10**.

### F2 — `place-order` labels submissions LIVE, no durable pre-send idempotency — **CONFIRMED**

`app/api/place-order/route.js:79` logs
`'[place-order] Submitting order (testOrder=false, LIVE):'`.

No idempotency key, operation key, or durable pre-send intent record exists
anywhere in the route or in `lib/placeOrderChain.js`. A retry, double-click, or
client timeout-and-resubmit places a **second real S&S order**. There is no
record written before the external call, so a request that times out leaves no
evidence that an order may have been placed — the "timeout-as-Unknown" state
the epic requires does not exist.

The route itself is otherwise well-formed: it is a thin adapter (auth →
validate → delegate → respond) and complies with Principle III.

→ Confirms the premise of **TG-001-03**.

### F3 — `pay/page.jsx` and `create-payment-session` accept `amountCents` from the request — **CONFIRMED**

`app/pay/page.jsx:18` holds `amountCents` in client state, seeded from the
`?amount=` **query parameter**, and posts it at `:34`.
`app/api/create-payment-session/route.js:13` destructures `amountCents`
straight from the request body and passes it to Stripe at `:54`.

Validation is type-only (`Number.isInteger(amountCents) && amountCents > 0`,
`:19`). **The amount is never compared against the invoice balance.** A
customer can edit the URL or the request body and pay $1.00 against any
invoice.

**Partial mitigation the backlog does not credit:** the route does call
`getInvoiceById(invoiceId)` (`:28`) and returns 404 if the invoice does not
exist, which blocks phantom invoice IDs. The invoice object is fetched and its
`contact.email` used — but its balance is never read. The fix is therefore
small: derive the amount from the invoice already in hand.

→ Confirms the premise of **TG-001-04**.

### F4 — `stripe-webhook` writes directly to Printavo and returns 200 after a failed write — **CONFIRMED**

Signature verification is correct and is a genuine abuse control
(`constructWebhookEvent`, returns 400 on failure). Beyond that:

1. The Printavo `paymentCreate` mutation is written **inline in the route
   handler** (`app/api/stripe-webhook/route.js:44-51`) rather than in
   `lib/printavo.js` — violates Principles III and V. Tracked as **V9**.
2. On failure the `catch` block logs and falls through to
   `return NextResponse.json({ received: true })` — HTTP 200 — with the
   comment *"Non-fatal: log but still return 200 so Stripe doesn't retry."*
   **A collected payment is silently not recorded**, and because 200
   suppresses Stripe's retry, the only recovery is someone reading logs.
3. No durable receipt and no deduplication. Stripe delivers at-least-once, so
   a redelivered `checkout.session.completed` records the payment on the
   Printavo invoice **twice**.

→ Confirms the premise of **TG-001-05**.

### F5 — `proxy.js` and `lib/adminAuth.js` use different Clerk role sources — **CONFIRMED**

| Layer | Source |
|---|---|
| `proxy.js:33` | `sessionClaims?.role === 'admin'` — JWT session claim |
| `lib/adminAuth.js:4` | `user?.publicMetadata?.role === 'admin'` — Clerk publicMetadata |

Two different sources of truth. `sessionClaims.role` is only populated if a
custom Clerk JWT template maps it; `publicMetadata.role` is what
`/api/admin-setup` actually writes (`admin-setup/route.js:25`). If the JWT
template is absent or drifts, the edge layer denies admins that the handler
layer would allow, or the reverse — and the two layers can disagree
indefinitely because nothing reconciles them.

The presence of `/api/debug-auth`, which exists solely to print
`roleFromClaimsMetadata` / `roleFromClaimsDirect` / `roleFromMetadata` side by
side, is direct evidence that this divergence has already caused live
confusion.

Note `proxy.js:35-40` also logs `userId` and `role` on **every** admin request.

→ Confirms the premise of **TG-001-06**.

### F6a — `/api/admin-setup` bootstrap risk — **CONFIRMED, with corrections**

Confirmed: the route is public (no `proxy.js` matcher entry), it promotes two
hard-coded emails (`gramigscott@gmail.com`, `aspmerch@gmail.com`) to admin, and
it demotes every other admin among the first 100 users. Its own comment says
*"Delete this file after use"* — it is still here.

Three corrections to the backlog wording:

- It is **not** unauthenticated. It requires `?token=$ADMIN_SETUP_TOKEN` and
  fails closed (403) when the env var is unset. The backlog understates this.
- The token travels **in the query string**, so it lands in Vercel access
  logs, browser history, and any `Referer` header. This is a real weakness the
  backlog does not name.
- `getUserList({ limit: 100 })` is unpaginated: an admin beyond the first 100
  users is silently not demoted, so the route does not do what it claims.

Tracked as **V10**. → Confirms the premise of **TG-001-09**.

### F6b — `/api/debug-auth` diagnostic risk — **CONFIRMED**

No token, no session requirement, no `proxy.js` matcher entry. It returns the
caller's full `sessionClaims` object, `publicMetadata`, primary email address,
and `Object.keys(sessionClaims)`.

Unauthenticated callers get nulls, so this is not an open data leak. Any
signed-in user — including a customer — gets their complete session claim set
and metadata dumped back, which discloses the exact shape of the authorization
model and the claim names an attacker would target.

→ Confirms the premise of **TG-001-09**.

**Phase 0 result: 6 of 6 findings confirmed. None was refuted or
superseded by newer evidence.** Corrections above narrow two of them
(F3, F6a) and widen one (F1).

---

## 8. New variances

Conditions found during this audit that the backlog's repository evidence does
not record. Each is linked to the epic/issue it affects.

| ID | Variance | Affects | Owner |
|---|---|---|---|
| **V1** | **No relational database exists.** Persistence is Vercel Blob JSON documents (whole-file read/modify/write, no transactions or locking) plus Printavo. TG-001-03 and TG-001-05 both require durable operation/receipt records and both depend on TG-003-03; **neither can be implemented until a datastore exists.** Blob JSON is not a safe substitute — concurrent writers lose records, which is precisely the failure mode idempotency must prevent. | TG-001-03, TG-001-05, TG-003-03 | Scott |
| **V2** | `/api/search-products` is in the `proxy.js` admin matcher but has **no in-handler authorization** — single-layer only, Principle VII violation. It proxies Printavo product search and logs `totalAmount`. A matcher regression exposes it outright. | TG-001-06 | Scott |
| **V3** | `/api/create-payment-session` has **neither** authentication **nor** the `isSameOrigin` guard that every other public route carries. It is the only public mutation route with no origin control, and it creates Stripe sessions. | TG-001-04, TG-001-07 | Scott |
| **V4** | **No rate limiting or quota exists anywhere.** The `rateLimit` identifiers in `app/api/orders-partial-state/route.js` and `lib/ssActivewear.js` read *S&S's* limit headers; they do not throttle inbound traffic. TG-001-07 requires quotas that have no foundation to build on. | TG-001-07 | Scott |
| **V5** | **NextAuth is removed but its remnants are load-bearing.** `next-auth` is still a dependency and is imported nowhere. `NEXTAUTH_URL` is now the origin allow-list value for three of the four origin guards (`upload:10`, `validate-promo:8`, `garment-pricing:12`): if it is unset in production each falls back to `http://localhost:3000` and rejects legitimate browser traffic. It also sets the Stripe success/cancel URLs (`create-payment-session:40`) and the customer proof link (`proof-upload:20`). `ADMIN_USERS` and `NEXTAUTH_SECRET` are still documented as required and presumably still provisioned in Vercel — live credentials for a decommissioned auth system, used only by four dead `scripts/*.mjs`. | TG-001-06, TG-001-09, TG-039-02 | Scott |
| **V5b** | **The four origin guards are inconsistent implementations of the same control.** `submit-quote:3-8` compares `Origin` against the `Host` header; `upload`, `validate-promo`, and `garment-pricing` compare it against `NEXTAUTH_URL`. All three of the latter also unconditionally allow any `http://localhost:*` or `http://127.0.0.1:*` origin **in production**, since nothing keys that branch to `NODE_ENV`. One shared helper in `lib/` is needed. | TG-001-07 | Scott |
| **V6** | **CI does not gate what it needs to.** `.github/workflows/playwright.yml` supplies only `NEXTAUTH_URL` and `NEXTAUTH_SECRET` — no Clerk, Stripe, Printavo, or S&S variables — so any authenticated path is untestable in CI. There is **no lint gate and no build gate**, and lint currently fails (17 errors). Confirms the premises of TG-039-01 and TG-039-02 with concrete numbers. | TG-039-01, TG-039-02 | Scott |
| **V7** | **The constitution is stale and now contradicts the code.** Principle VII mandates `getServerSession(authOptions)` in every protected handler — that function no longer exists anywhere; auth is Clerk. Principle VI's canonical safety example states `createSSOrder` *"hardcodes `testOrder: true`"* — it is `false`. Per Governance, "when the rule and an existing pattern in the code disagree, the rule is the source of truth" — but here the rule is simply out of date, so agents following it literally will write wrong code. **This must be amended before TG-001-02 and TG-001-06 land.** | EPIC-TG-001 governance, TG-001-02, TG-001-06 | Scott |
| **V8** | **README env-var drift** — a constitution violation under *Secrets & Configuration*. Referenced in code but undocumented: `ADMIN_SETUP_TOKEN`, `EVENTBRITE_API_KEY`, `TICKETMASTER_API_KEY`, `SS_ACTIVEWEAR_ACCOUNT_EMAIL`. Documented but unused by application code: `NEXTAUTH_SECRET`, `ADMIN_USERS`. | TG-001-10 | Scott |
| **V9** | `app/api/stripe-webhook/route.js` calls `gql()` with an inline GraphQL mutation **inside the route handler** — external API call in a route, violating Principles III and V. It is the only external mutation in the repo not wrapped in a `lib/` client, so it is also outside the audit-logging convention. | TG-001-05, TG-001-08 | Scott |
| **V10** | `/api/admin-setup` refinements (see F6a): token passed in the **query string** (leaks to access logs, history, `Referer`); admin emails hard-coded in source; `getUserList({ limit: 100 })` unpaginated so demotion silently misses users beyond the first 100; file still present despite its own "delete after use" instruction. | TG-001-09 | Scott |
| **V11** | **Test baseline is not green and not reproducible as configured.** One pre-existing failure (`quote-extended.spec.js:242`, ambiguous `getByText(/48/)` locator — a test defect, deterministic, not a flake). Separately, `@playwright/test` 1.60.0 requests Chromium build 1223 while the audit container ships 1194, failing all 151 tests until the path is redirected. T2 asks future issues to "preserve a green build"; **the build is not green today**, so this failure must be fixed or explicitly waived before it can be used as a gate. | TG-039-01, TG-039-07 | Scott |
| **V12** | **Customer PII and payment identifiers are in logs today**, beyond the raw-payload issue in F1: `create-payment-session:44` logs `customerEmail`; `stripe-webhook:34` logs `customerEmail` and `sessionId`; `place-order:79` logs `paymentProfileId`; `proxy.js:35` logs `userId` and `role` on every admin request. Directly contradicts the epic's security floor. | TG-001-08 | Scott |

---

## 9. Variance register

AC2 requires every variance to carry an owner and a linked issue, and every
unchanged finding to be explicitly confirmed rather than silently assumed.

**Owner convention:** the only owner named anywhere in EPIC-TG-001 is Scott,
via the exit gate *"Scott signs the Phase 0 safety checklist."* Every row is
therefore assigned to Scott for triage and reassignment. No other owner is
invented here.

| ID | Type | Linked issue | Owner | Disposition |
|---|---|---|---|---|
| F1 | Confirmed | [#115 TG-001-02](https://github.com/p0wder/asp-webapp/issues/115), [#121 TG-001-08](https://github.com/p0wder/asp-webapp/issues/121), [#123 TG-001-10](https://github.com/p0wder/asp-webapp/issues/123) | Scott | Proceed as written; widen TG-001-08 to cover `paymentProfile` |
| F2 | Confirmed | [#116 TG-001-03](https://github.com/p0wder/asp-webapp/issues/116) | Scott | **Blocked by V1** |
| F3 | Confirmed (narrowed) | [#117 TG-001-04](https://github.com/p0wder/asp-webapp/issues/117) | Scott | Proceed; invoice is already fetched, so the fix is small |
| F4 | Confirmed | [#118 TG-001-05](https://github.com/p0wder/asp-webapp/issues/118) | Scott | **Blocked by V1** |
| F5 | Confirmed | [#119 TG-001-06](https://github.com/p0wder/asp-webapp/issues/119) | Scott | Proceed; decide which source is canonical |
| F6a | Confirmed (corrected) | [#122 TG-001-09](https://github.com/p0wder/asp-webapp/issues/122) | Scott | Proceed; see V10 |
| F6b | Confirmed | [#122 TG-001-09](https://github.com/p0wder/asp-webapp/issues/122) | Scott | Proceed |
| V1 | New — blocker | [#116](https://github.com/p0wder/asp-webapp/issues/116), [#118](https://github.com/p0wder/asp-webapp/issues/118), TG-003-03 | Scott | **Decision required before Wave 1** |
| V2 | New | [#119 TG-001-06](https://github.com/p0wder/asp-webapp/issues/119) | Scott | Add to TG-001-06 scope |
| V3 | New | [#117](https://github.com/p0wder/asp-webapp/issues/117), [#120](https://github.com/p0wder/asp-webapp/issues/120) | Scott | Add to TG-001-07 scope |
| V4 | New | [#120 TG-001-07](https://github.com/p0wder/asp-webapp/issues/120) | Scott | Confirms scope; no foundation exists |
| V5 | New | [#119](https://github.com/p0wder/asp-webapp/issues/119), [#122](https://github.com/p0wder/asp-webapp/issues/122), [#409](https://github.com/p0wder/asp-webapp/issues/409) | Scott | Rotate/retire stale credentials |
| V5b | New | [#120 TG-001-07](https://github.com/p0wder/asp-webapp/issues/120) | Scott | Consolidate into one `lib/` helper; gate the localhost branch on `NODE_ENV` |
| V6 | New | [#408 TG-039-01](https://github.com/p0wder/asp-webapp/issues/408), [#409 TG-039-02](https://github.com/p0wder/asp-webapp/issues/409) | Scott | Confirms both premises |
| V7 | New — governance | EPIC-TG-001 | Scott | **Amend constitution before TG-001-02 / TG-001-06** |
| V8 | New | [#123 TG-001-10](https://github.com/p0wder/asp-webapp/issues/123) | Scott | Fold into TG-001-10 |
| V9 | New | [#118](https://github.com/p0wder/asp-webapp/issues/118), [#121](https://github.com/p0wder/asp-webapp/issues/121) | Scott | Move mutation into `lib/printavo.js` |
| V10 | New | [#122 TG-001-09](https://github.com/p0wder/asp-webapp/issues/122) | Scott | Delete the route, or gate on header + pagination |
| V11 | New | [#408](https://github.com/p0wder/asp-webapp/issues/408), [#414](https://github.com/p0wder/asp-webapp/issues/414) | Scott | Fix the locator before lint/test become gates |
| V12 | New | [#121 TG-001-08](https://github.com/p0wder/asp-webapp/issues/121) | Scott | Widen TG-001-08 scope |
| **O1** | **Open — AC1 gap** | [#114 TG-001-01](https://github.com/p0wder/asp-webapp/issues/114) | **Scott** | **Supply `asp-webapp-master.zip` for SHA-256 + diff, or waive the archive comparison in favour of the Git binding in §1** |

---

## 10. Recommended sequencing

Derived strictly from what this audit found; the epic owner decides.

1. **Amend the constitution (V7)** — it currently instructs agents to write
   NextAuth code. Everything downstream inherits this error. Cheapest fix,
   highest blast radius.
2. **Resolve the datastore decision (V1)** — TG-001-03 and TG-001-05, the two
   highest-value safety controls, cannot start without it.
3. **Ship the Wave 0 items that are genuinely unblocked**: TG-001-02 (kill
   switch), TG-001-04 (server-derived amount — the invoice is already in
   hand), TG-001-06 + V2 (single role source), TG-001-09 + V10 (delete the two
   bootstrap/diagnostic routes), TG-001-08 + V12 (redaction).
4. **Fix the failing test (V11) before making lint or tests a CI gate** —
   TG-039-01 will fail on day one otherwise.

## 11. Reproducing this audit

```bash
git checkout 068645e5fc864e27701b7f3bd5b053010ba8f18f
git ls-files -s | sha256sum      # c06cf683c87b8831e92ed15f62e0d29a9f8c0df6eeb0c835c652445a569f8159
npm ci
npx playwright test --project=chromium --reporter=list   # 150 passed, 1 failed
npm run build                                            # exit 0
npm run lint                                             # exit 1, 16 errors + 2 warnings
```

---

<sub>Evidence for TG-001-01 under EPIC-TG-001. Append-only: supersede with a
new dated report rather than editing this one. No application code, test, or
configuration file was modified to produce it.</sub>
