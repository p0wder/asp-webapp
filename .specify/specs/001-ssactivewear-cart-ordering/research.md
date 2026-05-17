# Phase 0 Research: SS Activewear Cart & Ordering Workflow

**Feature**: 001-ssactivewear-cart-ordering · **Date**: 2026-05-17

This document resolves the open technical questions surfaced during `/speckit-plan` and records the rationale for each decision. All NEEDS CLARIFICATION items from the plan template have been resolved.

---

## R1 — Catalog match strategy

**Decision**: Match invoice line items against the SS Activewear catalog using the existing `fetchSSProduct(styleNumber, { filterBy: 'style' })` endpoint (which hits `/v2/products/?style={name}`), not the curated `STYLE_ID_MAP`. Cache results per `(styleNumber, color)` for the lifetime of the page session.

**Rationale**:

- `STYLE_ID_MAP` in `lib/ssActivewear.js` currently has only two hand-curated entries (Gildan 5000, Next Level 6210). Restricting catalog matches to those would falsely flag every other Printavo line item as Sanmar.
- The `?style=` filter accepts brand+style strings directly; Printavo's `itemNumber` field is the style number. Combined with the brand context already on the invoice, we can resolve unknowns without growing `STYLE_ID_MAP`.
- `STYLE_ID_MAP` is still useful as a fast-path for the pre-existing `garment-pricing` endpoint and is left untouched.

**Alternatives considered**:

- **Growing `STYLE_ID_MAP` exhaustively** — rejected. Requires manual entry per garment; will rot.
- **Fuzzy match on description** — rejected by clarification Q1 (style-number-only matching).

---

## R2 — Invoice line item → SS Activewear SKU resolution

**Decision**: At "Add to Cart" time, expand each Printavo line item's `sizes[]` into one SKU per (size, color) using the line item's `itemNumber` (style number) and `color` fields. Resolve the SS Activewear `sku` field by matching the variant whose `sizeName`/`colorName` equal the line item's size/color (after the existing `sizeLabel()` mapping).

**Rationale**:

- The existing `/api/place-order` route requires `{ identifier, qty }` where `identifier` is the SS Activewear SKU (e.g. `B00060043` or `G500-S-WHITE`). Mapping must happen before submission.
- Printavo line items already carry `itemNumber` + `color` + `sizes[].size`/`count`. Doing the expansion at add-time keeps the cart in the same unit SS Activewear expects, simplifying the order-submission step.
- Per-size expansion means the catalog-lookup response can be the same shape regardless of how many sizes a line item covers.

**Alternatives considered**:

- **Resolve SKUs at submission time** — rejected. Would require re-fetching SS Activewear data at submit, doubling the API calls and creating a window where the cart and the live catalog disagree silently.
- **Store line-item references in cart, expand on every render** — rejected. Couples cart state to the SS Activewear network roundtrip on every page navigation.

---

## R3 — Cart state and persistence

**Decision**: Cart lives in `localStorage` under key `asp.cart.v1` as a JSON object `{ items: CartItem[], updatedAt: string }`. React subscribes via `useSyncExternalStore` so the UI re-renders consistently across components. A `window.addEventListener('storage', ...)` listener syncs across browser tabs within the same origin.

**Rationale**:

- Clarification Q2 selected localStorage; no server-side cart in v1.
- `useSyncExternalStore` (built into React 18+) eliminates tear and lets every consumer subscribe with no extra context boilerplate.
- The `storage` event fires in *other* tabs only (not the originating one), so the originating tab updates via its own setter and other tabs update via the listener — covering the multi-tab case raised as an Outstanding clarification.
- Versioning the key (`v1`) lets a future migration drop the old cart cleanly without colliding.

**Alternatives considered**:

- **React Context only, no `useSyncExternalStore`** — rejected. Cross-tab sync would require ad-hoc effect plumbing; teardown of stale state on remote updates is awkward.
- **IndexedDB** — rejected. Overkill for <100 items, and the API is async, complicating SSR/streaming reads.
- **Zustand / other state lib** — rejected by constitution III (no new deps).

---

## R4 — Catalog lookup transport

**Decision**: New thin API route `POST /api/ss-catalog-lookup` accepts a batch of `{ styleNumber, color }` items and returns an array of `{ matched: boolean, variants?: [{ sku, sizeName, qty, customerPrice }] }`. The route validates auth + input then delegates to a new helper `lookupSSVariantsForLineItems()` in `lib/ssActivewear.js`.

**Rationale**:

- Batched request fits the constraint that an invoice card may have many line items; serially calling SS Activewear from the client would be slow and would expose credentials.
- Constitution V requires API routes to be thin adapters — all business logic stays in `lib/`.
- Keeping the contract per-(style,color) means stock data and pricing flow through one round-trip and can be re-used by both the order-card render and the checkout-page stock re-check.

**Alternatives considered**:

- **Reuse `/api/search-products`** — rejected. Search semantics aren't a clean fit for "is this exact style number in the catalog"; the response would need post-filtering on the client.
- **Per-line-item endpoint** — rejected. N round-trips for an invoice with N line items.

---

## R5 — Lookup failure UX & retry scope

**Decision**: Per-invoice lookups have a per-line-item state machine: `pending → matched | sanmar | failed`. On `failed`, the UI shows a "Retry" button that re-runs the lookup *for that line item only*. A line-item-level `AbortController` lets the user navigate away cleanly.

**Rationale**:

- Clarification Q3 picked "show 'Lookup failed — Retry'; don't classify until resolved." A whole-invoice retry would be confusing if only one item failed.
- Aligns with FR-016 (per-line-item retry).
- Limits API blast radius — if SS Activewear is intermittently down, only the failed lines re-hit it.

**Alternatives considered**:

- **Whole-invoice retry button** — rejected. Re-fetches already-resolved lines.
- **Silent auto-retry with exponential backoff** — rejected by Q3 (explicit user-triggered retry preferred).

---

## R6 — Stock check at pre-checkout

**Decision**: When the `/orders/checkout` page mounts, re-call `/api/ss-catalog-lookup` for all SKUs in the cart (grouped by style+color to keep one request per group). Compare each cart item's `qty` to the variant's `qty` field; if `cartQty > variantQty`, render an inline stock warning with two actions: "Reduce to N" (sets cart qty to available) and "Remove".

**Rationale**:

- Clarification Q4: show stock warnings inline; do not block submission.
- Re-querying at checkout (rather than caching the order-card response) ensures stock is fresh at decision time.
- Reducing/removing is per-item, matching the "user explicitly chooses" requirement (FR-017).

**Alternatives considered**:

- **Block submission on any stock shortage** — rejected by Q4.
- **Auto-truncate cart silently** — rejected by Q4.
- **Use `/v2/inventory/` instead of `/v2/products/`** — rejected. The products endpoint already returns `qty`; an extra endpoint complicates the contract.

---

## R7 — Quantity editing

**Decision**: Cart UI shows a numeric input per line item with `min=1` and `+`/`−` steppers. Setting to 0 (or pressing the trash icon) removes the item.

**Rationale**: Clarification Q5. Free editing supports the "reduce qty" path required by R6.

**Alternatives considered**: Locked-to-invoice quantity (rejected by Q5).

---

## R8 — Duplicate-submit and idempotency (Outstanding clarification — v1 scope)

**Decision**: In v1, prevent client-side double-submit by disabling the Submit Order button between click and response, and clearing the cart only on `success: true`. Do **not** introduce a server-side idempotency token in v1 — the SS Activewear API itself has `testOrder: true` hardcoded, so duplicate test orders carry no business cost.

**Rationale**:

- The clarification "duplicate-submit / idempotency" was deferred from /speckit-clarify because it's an implementation choice, not a behavioral unknown.
- Client-side gating handles the common case (impatient double-click). The hardcoded `testOrder: true` further bounds risk.
- When `testOrder` is eventually flipped to live orders, we will revisit and add a server-generated idempotency key passed through to SS Activewear's `poNumber` or a header.

**Alternatives considered**:

- **Server-side idempotency key (UUID stored in DB)** — rejected for v1. Requires storage we don't have; not justified while `testOrder: true`.
- **Optimistic UI with revert on failure** — rejected. Adds complexity for negligible perceived-perf gain.

**Follow-up**: When the `testOrder: true` override is removed in a future feature, add an idempotency token before going live. Flagged in the spec's Outstanding items.

---

## R9 — Cart indicator placement

**Decision**: Render `<CartIndicator />` in `components/Header.js` (visible from any authenticated page). On `/orders` the indicator double-renders as a sticky element near the page header so it's reachable while scrolling.

**Rationale**: FR-015 requires the count be "visible from the orders page". Header is a natural single home; the sticky variant on `/orders` keeps it in view during long invoice lists.

**Alternatives considered**:

- **Only on `/orders`** — rejected. Once the cart spans multiple invoices, users will navigate around; losing the count is disorienting.
- **Floating action button** — rejected as over-engineered for a count badge.

---

## R10 — Where pricing comes from on the checkout summary

**Decision**: Display unit costs and line totals from the **Printavo invoice line item** (`li.price`), not SS Activewear pricing. This matches the spec Assumption that costs displayed reflect the invoice, not catalog prices.

**Rationale**: The invoice price is what the customer agreed to. SS Activewear `customerPrice` is the dealer cost — different concept. We may surface SS pricing as a secondary "your cost" column in a later iteration but not in v1.

**Alternatives considered**:

- **Use SS Activewear `customerPrice`** — rejected for v1 per spec assumption.
- **Show both side-by-side** — deferred (not required for the primary user flow).

---

## Summary table

| ID | Topic | Decision | Source |
|---|---|---|---|
| R1 | Catalog match | Use `fetchSSProduct(..., filterBy:'style')`; ignore `STYLE_ID_MAP` for matching | Clarification Q1 |
| R2 | SKU resolution | Expand to (style,size,color) SKUs at add-time | Plan design |
| R3 | Cart persistence | `localStorage` + `useSyncExternalStore` + `storage` event | Clarification Q2 |
| R4 | Lookup transport | New `POST /api/ss-catalog-lookup` batch endpoint | Plan design |
| R5 | Failure UX | Per-item state machine with "Retry" | Clarification Q3 |
| R6 | Stock check | Re-query on checkout mount; inline warnings | Clarification Q4 |
| R7 | Quantity edits | Free edit, min=1, 0 removes | Clarification Q5 |
| R8 | Idempotency | Client gate only in v1; revisit when going live | Outstanding clarification |
| R9 | Cart indicator | Header + sticky on /orders | FR-015 |
| R10 | Pricing source | Printavo line item, not SS | Spec assumption |
