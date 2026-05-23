# Implementation Plan: Printavo Goods-In-Transit Status Notification

**Branch**: `001-printavo-order-notification` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/002-printavo-order-notification/spec.md`

## Summary

After a successful SS Activewear cart checkout, automatically advance any Printavo invoice that is **100% ordered via SS Activewear** from "Ready to Order" to "Goods In Transit", and surface partial invoices (Sanmar items, missing items, removed items, or under-quantity items) for follow-up — both on the post-checkout confirmation screen and, persistently, on the orders page via a derived partial badge.

**Technical approach**: Extend `/api/place-order` to chain server-side: (1) SS submission, (2) per-invoice classification (pure function in `lib/`), (3) Printavo status updates via a new `setInvoiceStatus` helper in `lib/printavo.js`, (4) persist an **Order Attribution Record** to Vercel Blob keyed by SS order number. Add a new `/api/printavo-status-update` retry endpoint (idempotent). Add a new `/api/orders-partial-state` endpoint that, per invoice, queries SS Activewear `GET /v2/orders/?ponumber=<visualId>&lines=true` and joins each returned line item against the attribution records to compute shortfall. Fix the cart-layer dedup defect at `lib/cart.js:32-38` to key by `(sku, sourceInvoiceId)`.

## Technical Context

**Language/Version**: JavaScript (ES modules), Node.js (Vercel runtime, current LTS)

**Primary Dependencies**: Next.js 16.1.6 (App Router) + React 19.2.3 with the React Compiler; NextAuth v4 (credentials provider); `@vercel/blob` 2.3.3 (for Order Attribution Record persistence); `react-hook-form` for admin forms. **No new runtime dependencies are added by this feature.**

**Storage**: Vercel Blob (existing dependency) — one JSON blob per SS Activewear order, keyed by SS `orderNum` (or normalized `poNumber` as fallback). Chosen over a database/KV in Phase 0 research because (a) no existing DB in the repo, (b) the constitution favours minimal dependencies (YAGNI), (c) write-once-read-many access pattern fits Blob well, (d) per-invoice partial-state derivation reads at most O(invoices on screen) blobs, not O(all orders).

**Testing**: No automated test framework is currently configured in this repo. Per the constitution's YAGNI principle and the small-team operating model, validation for this feature is via the `quickstart.md` manual flow plus the existing `/loop` + `/verify` skills for manual UI verification. Logging via `console.log` (per Principle V) is the audit trail.

**Target Platform**: Vercel (production from `master`; preview deployments for every branch). Browser targets follow the rest of the app.

**Project Type**: Web application — single Next.js App Router project (no backend/frontend split).

**Performance Goals**: Aligned with spec SCs — Printavo status update completes within 10s of SS success in ≥95% of attempts (SC-001); partial-badge drill-down renders within 3s of opening in ≥95% of attempts (SC-008). SS Activewear's documented rate limit is 60 requests/min; orders-page partial-state derivation MUST batch or cache reads where possible to stay under this limit when many invoices are displayed.

**Constraints**: Never overwrite a Printavo invoice status that is not "Ready to Order" (SC-006, FR-006). Order Attribution Record writes MUST be durable and survive across sessions/devices (FR-018). Per-invoice failures MUST be independent — one Printavo failure cannot block another invoice's status update (FR-012, SC-003).

**Scale/Scope**: Small admin tool — typically <10 "Ready to Order" invoices visible at a time, single-digit users, low write rate (a few SS orders per day). Order Attribution Record blob count grows linearly with SS orders placed; pruning is out of scope for Phase 1.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-evaluated after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.1.0:

| Principle | Compliance | Notes |
|---|---|---|
| **I. Next.js App Router First** | PASS | All new routes under `app/api/`. No new client/server boundary surprises — orders page stays a Client Component, partial-state derivation runs in a new API route. |
| **II. JavaScript Only — No TypeScript** | PASS | All new files will be `.js` / `.jsx`. No `tsconfig.json`, no `.ts`. JSDoc on new `lib/` exports per existing convention. |
| **III. API Routes as Thin Adapters** | PASS | New routes are pure adapters: auth → validate → delegate to `lib/`. Classification logic, Printavo status update, Vercel Blob I/O, and SS order-history queries all live in `lib/` modules. Estimated route file size: < 80 lines each. |
| **IV. Pure Logic Separated from I/O** | PASS | New `lib/orderClassification.js` is a pure module (cart + invoice → per-invoice classification). New `lib/orderAttribution.js` is the I/O adapter for Vercel Blob (mirroring the `cart.js` vs `cartStorage.js` split). Pure modules MUST NOT import I/O modules. |
| **V. External APIs Wrapped in lib/ Clients** | PASS | `setInvoiceStatus` added to `lib/printavo.js`. `getSSOrdersByPO` added to `lib/ssActivewear.js`. Both log request+response per Principle V (mutating call for Printavo, non-mutating for SS — but the SS call still logs on error). Credentials sourced from existing env vars; no new env vars needed. |
| **VI. Safety Defaults for Real-World Side Effects** | PASS | `lib/printavo.js` adds `const DRY_RUN_INVOICE_STATUS_UPDATE = false;` as the explicit go-live gate (mirroring the `testOrder: true` pattern in `lib/ssActivewear.js`). `setInvoiceStatus` checks this const before issuing the mutation; when `true` it logs the intended transition and short-circuits with a no-op success. Combined with: (a) hardcoded status-ID allow-list (only `READY_TO_ORDER_STATUS_ID` → `GOODS_IN_TRANSIT_STATUS_ID` is allowed), (b) FR-006 read-then-write check that refuses to overwrite a non-"Ready to Order" status, (c) comprehensive logging per Principle V. Flipping `DRY_RUN_INVOICE_STATUS_UPDATE` is a reviewable in-code change, satisfying VI literally. |
| **VII. Defence-in-Depth Auth on Protected Routes** | PASS | Both new routes (`/api/printavo-status-update` retry, `/api/orders-partial-state` derivation) get: (1) a matcher entry in `proxy.js` `config.matcher`, and (2) `getServerSession(authOptions)` at the top of each handler. Existing `/api/place-order` already has both. |

**Gate result**: PASS. All seven principles satisfied; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/002-printavo-order-notification/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output (storage choice + Printavo Invoice mutation verification + SS GET /orders details)
├── data-model.md        # Phase 1 output (Order Attribution Record + Invoice Classification entities)
├── quickstart.md        # Phase 1 output (manual validation flow)
├── contracts/           # Phase 1 output (API request/response schemas)
│   ├── place-order.md
│   ├── printavo-status-update.md
│   └── orders-partial-state.md
├── spec.md              # Feature specification
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

This feature touches the existing single-project layout. No new top-level directories.

```text
app/
├── api/
│   ├── place-order/route.js                  # UPDATED — server-side chains classification + Printavo + attribution write
│   ├── printavo-status-update/route.js       # NEW — idempotent retry endpoint for failed status updates (FR-010)
│   └── orders-partial-state/route.js         # NEW — per-invoice partial-state derivation (FR-013, FR-014, FR-019)
└── orders/
    ├── page.jsx                              # UPDATED — renders partial badge + drill-down on Ready-to-Order cards (US 3)
    └── checkout/
        └── page.jsx                          # UPDATED — sends sourceInvoiceId + sourceLineItemId on each line (FR-017); renders new aggregated response on confirmation (US 1, US 2, US 4)

lib/
├── cart.js                                   # UPDATED — change dedup key from sku to (sku, sourceInvoiceId) (FR-016)
├── printavo.js                               # UPDATED — add setInvoiceStatus(invoiceId, statusId) + GOODS_IN_TRANSIT_STATUS_ID const
├── ssActivewear.js                           # UPDATED — add getSSOrdersByPO(poNumber, opts) using GET /v2/orders/?ponumber=...&lines=true
├── orderClassification.js                    # NEW — PURE — classifyInvoices({cartItems, invoices, attributionRecords}) → per-invoice result
└── orderAttribution.js                       # NEW — I/O — readRecord(orderRef), writeRecord(orderRef, record), listRecordsForInvoice(visualId) via @vercel/blob

proxy.js                                      # UPDATED — add matcher entries for two new API routes (Principle VII)
```

**Structure Decision**: Single Next.js App Router project (existing). All work lives within `app/` (routes/UI) and `lib/` (logic/IO). One pure module (`orderClassification.js`) and one IO module (`orderAttribution.js`) are added, mirroring the canonical `cart.js` / `cartStorage.js` split from Principle IV.

## Complexity Tracking

| Violation / Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **New external storage surface — Vercel Blob for Order Attribution Records** | The feature genuinely requires durable per-SS-order metadata that is NOT recoverable from any external API (SS Activewear's GET orders does not return source-invoice attribution). Without it, FR-019's lossless derivation and SC-002's "zero silent over-advance" cannot be met. | A new database/KV store (e.g., `@vercel/kv`) would be a new runtime dependency violating the YAGNI rule in the constitution's Technology Stack section. Vercel Blob is already in the repo (`@vercel/blob` ^2.3.3) and the access pattern (write-once on SS submission, read by SS order key) is well-suited. |
