# Phase 0 Research: Printavo Goods-In-Transit Status Notification

**Date**: 2026-05-23

Resolves every NEEDS CLARIFICATION marker that would otherwise block design. Each decision is recorded with rationale and rejected alternatives.

---

## 1. Storage backend for Order Attribution Records

**Decision**: Vercel Blob (existing `@vercel/blob` ^2.3.3 dependency). One JSON blob per SS Activewear order, keyed by `ss-order-attribution/{orderRef}.json` where `orderRef` is the SS `orderNum` (preferred) or normalized PO number (fallback). A secondary index (per Printavo invoice visualId) is maintained as a separate blob at `ss-order-attribution/by-invoice/{visualId}.json` containing the list of `orderRef`s that touched that invoice.

**Rationale**:
- The constitution's Technology Stack section and Development Standards explicitly require justification for adding runtime dependencies. Vercel Blob is already in use (`app/api/upload/route.js`), so no new dependency is needed.
- Access pattern fits Blob: write-once on SS submission, point-read on partial-state derivation. No transactional needs.
- The secondary by-invoice index makes per-invoice derivation O(1) blob list + N reads where N = number of SS orders touching that invoice (typically 0–3 for an admin tool of this scale).
- Survives across sessions, devices, and deployments — satisfies FR-018 durability.

**Alternatives considered**:
- **`@vercel/kv` (Upstash Redis)**: Faster reads, atomic ops. Rejected: new runtime dependency violating YAGNI; the read latency budget (3s per SC-008) is generous enough that Blob is fine.
- **Single Blob with array of all attribution records**: Simpler indexing but introduces a read-modify-write race on every SS submission. Rejected.
- **External Postgres / Supabase**: Massive overkill for this scale. Rejected.
- **Embedding attribution JSON in SS Activewear order `comments` field**: Carries through SS unchanged, no new storage. Rejected: SS `comments` is human-facing and may be visible to vendors / on packing slips; not a good place for structured metadata. Also length-limited.

---

## 2. Printavo `statusUpdate` mutation against an Invoice (not a Quote)

**Decision**: Use the existing `statusUpdate(parentId, statusId)` mutation in `lib/printavo.js`, but with an Invoice fragment in the selection set: `... on Invoice { id visualId status { id name } }`. Wrap in a new exported function `setInvoiceStatus(invoiceId, statusId)`.

**Rationale**:
- The mutation's documented return type at `lib/printavo.js:27` is `OrderUnion` — a union that includes both Quote and Invoice variants. This is structural evidence the same mutation accepts non-Quote parents.
- Pattern mirrors the existing `setQuoteStatus(quoteId, statusId)` at `lib/printavo.js:193-203`. New helper is a near-duplicate with `... on Invoice` instead of `... on Quote`.
- The invoice's `id` field (the GraphQL node ID, distinct from `visualId`) is the correct `parentId`. Source: query at `app/api/ready-to-order/route.js:23-81`.

**Alternatives considered**:
- **Generic `setOrderStatus(parentId, statusId)` accepting any union variant**: Slightly more reusable but adds polymorphism noise to the lib API. Rejected for Phase 1 — when a third variant appears, refactor then.
- **Inline the mutation in the route handler**: Violates Principle III (thin adapters) and V (external APIs in lib). Rejected.

**Open verification (planning-phase, pre-implementation)**:
- The exact `... on Invoice` field set must match Printavo's schema. The same fields used for Quote (`id`, `visualId`, `status { id name }`) are expected to exist on Invoice but should be verified via Printavo introspection during implementation. Fallback if any field is missing: drop it from the selection set; the mutation still returns and the call still succeeds.

---

## 3. "Goods In Transit" Printavo status ID

**Decision**: Hardcode as `GOODS_IN_TRANSIT_STATUS_ID` in `lib/printavo.js` alongside the existing `READY_TO_ORDER_STATUS_ID = '256605'` (in `app/api/ready-to-order/route.js:7`). Resolve the actual ID value at implementation time via Printavo admin UI introspection (browse → status configuration → copy ID) or by running a one-off `scripts/find-printavo-status-id.mjs` script that queries Printavo's `statuses` GraphQL field and prints the matching status.

**Rationale**:
- Existing pattern: status IDs are inline `const` values in the files that use them (`READY_TO_ORDER_STATUS_ID` at the route handler; `QUOTE_STATUS_ID` at `app/api/submit-quote/route.js:28`). Following the same pattern keeps the diff small.
- Moving the ID to `lib/printavo.js` makes both `READY_TO_ORDER_STATUS_ID` and `GOODS_IN_TRANSIT_STATUS_ID` co-located with the new `setInvoiceStatus` helper that uses them — better cohesion than spreading across route files.
- The status-ID allow-list noted in Constitution Check (VI) lives in `lib/printavo.js`: only the transition `READY_TO_ORDER_STATUS_ID → GOODS_IN_TRANSIT_STATUS_ID` is permitted by `setInvoiceStatus`.

**Alternatives considered**:
- **Env var**: Allows changing the ID without a code edit. Rejected — violates Constitution Principle VI (runtime flags MUST NOT be the sole gate for safety-relevant changes) and adds an env var per the constitution's "every new env var must be documented in README.md" rule with no countervailing benefit.
- **Runtime lookup of status by name**: Adds an API call to every status update. Rejected — slower, and the status name is itself only stable by convention.

**Open verification (planning-phase, pre-implementation)**:
- The actual numeric value of `GOODS_IN_TRANSIT_STATUS_ID` is unknown until Printavo admin is opened. The plan, data model, and contracts are agnostic to the value; only the const initializer needs to be filled in at implementation time. A `// TODO: confirm ID` comment is acceptable until verified.

---

## 4. SS Activewear `GET /v2/orders/` for order-history derivation

**Decision**: Use `GET https://api.ssactivewear.com/v2/orders/{identifier}?lines=true&mediaType=json` where `identifier` is the **normalized** Printavo invoice visualId (strip the `#` prefix and any `, ` separator; URL-encode). Wrap in a new exported function `getSSOrdersByPO(visualIdOrPoNumber, opts)` in `lib/ssActivewear.js`. Returns an array of SS order objects with the relevant fields: `orderNumber`, `invoiceNumber`, `poNumber`, `orderStatus`, `lines[]` (each `{ sku, qtyOrdered, qtyShipped, ... }`).

**Rationale**:
- SS Activewear documents this endpoint (per Phase-0 research agent: see [GET Orders](https://api.ssactivewear.com/V2/Orders.aspx)).
- Auth, base URL (`SS_API_BASE`), and the `GET` + Basic auth + `Accept: application/json` pattern already exist in `lib/ssActivewear.js` for catalog and product calls (`lib/ssActivewear.js:84, 198, 293`). The new function reuses the same auth header construction.
- The PO field in existing SS orders is stamped as `"#1234, #1235"` (with `#` and `, ` separator — per `app/orders/checkout/page.jsx:137-141`). The SS GET endpoint accepts a comma-separated list of identifiers per the docs; we MUST normalize by stripping `#` and trimming spaces before querying. The new function handles this normalization internally.
- Rate limit: 60 requests/min per the SS docs. Orders page partial-state derivation MUST batch or de-duplicate calls when many invoices share the same PO list; the new `/api/orders-partial-state` endpoint does this batching server-side (see contracts).

**Alternatives considered**:
- **Persist a local copy of every SS order we've placed (in addition to the Order Attribution Record)**: Avoids the SS GET call on every orders-page load. Rejected for Phase 1 — adds storage complexity, and the SS-source-of-truth approach is more correct (handles cancellations/edits in SS).
- **Query SS by `orderNumber` instead of `ponumber`**: Requires storing the `orderNumber` returned from POST locally and looking it up; equivalent or worse than the Blob-keyed approach already chosen. Not rejected outright — the by-invoice secondary index in storage decision 1 stores `orderRef`s and the derivation joins those. Practically, derivation will be: (a) read by-invoice index → list of `orderRef`s, (b) for each `orderRef` fetch the attribution blob locally, (c) optionally cross-check by hitting SS GET to confirm the order still exists / qty shipped. For Phase 1, (a)+(b) is sufficient; the SS GET call is the corroborating source per FR-014 ("derivation queries the SS Activewear order history"), so we do still need it.

**Open verification (planning-phase)**:
- Confirm that orders created with `testOrder: true` are returned by GET /v2/orders/. If not, partial-state derivation will not work in development/preview deployments. Mitigation: planning will arrange for a single non-test order to exist in a non-production SS account, OR temporarily toggle the test flag for a verification trip and immediately revert (with the Principle VI in-code change called out). This is a planning-phase TODO captured here, not blocking the design.

---

## 5. Cart-layer dedup fix scope

**Decision**: Change the dedup key in `lib/cart.js:32-38` from `item.sku` to a composite key that combines `item.sku` and `item.sourceInvoiceId`. The existing quantity-merge behavior continues to apply only when both fields match. No other cart behavior changes.

**Rationale**:
- FR-016 mandates this change.
- The constitution's Principle IV (pure logic separated from I/O) means `lib/cart.js` is the pure module and the change can be unit-verified by walking through it manually (no test framework; this is the project's standard).
- Keeping the change tightly scoped (one dedup function) minimizes the blast radius for spec-001 features that depend on `lib/cart.js`.

**Alternatives considered**:
- **Key by `(sku, sourceLineItemId)` instead**: More precise (distinguishes two line items on the same invoice with the same SKU). Rejected — Printavo line items on a single invoice already differ by line item ID; the same SKU from the same invoice on different lines is rare and behaviorally indistinguishable. `(sku, sourceInvoiceId)` is the minimum fix needed for the attribution use case. If a future feature needs line-item-level granularity, the key can be extended then.

---

## 6. Server-side chaining and per-invoice failure independence

**Decision**: Inside the extended `/api/place-order` route, perform the chain in this exact order, using `Promise.allSettled` for the per-invoice Printavo status updates so one invoice's failure does not abort the others:

1. Submit SS order (await `createSSOrder`).
2. On success, compute `classifications = classifyInvoices({...})` — pure call.
3. `await Promise.allSettled(qualifyingInvoices.map(inv => setInvoiceStatus(inv.id, GOODS_IN_TRANSIT_STATUS_ID)))`. Pre-check each invoice's current status via the result of step 2 (which was sourced from the orders-page fetch in step 0) AND optionally via a re-read inside `setInvoiceStatus` if the gap between page load and submission is non-trivial — see open question.
4. Persist Order Attribution Record blob.
5. Return aggregated response: `{ ok: true, ssOrder, perInvoice: [{ visualId, classification, statusUpdate: 'updated' | 'failed' | 'skipped', error?: string }] }`.

**Rationale**:
- Satisfies FR-021, FR-012, SC-003.
- `Promise.allSettled` over `Promise.all` ensures one failure doesn't reject the whole chain (which would lose the SS order context for the user).

**Open question** (deferred to implementation, not blocking):
- Whether to re-read invoice status inside `setInvoiceStatus` to satisfy FR-006 (refuse to overwrite a non-Ready-to-Order status). Two options: (a) trust the classification result (read once, may be stale by seconds), (b) re-read inside `setInvoiceStatus` (extra API call, slower, more accurate). Decision: implement (a) for Phase 1 and add a TODO for (b) if production observes a race. The Printavo statusUpdate mutation itself is the strongest gate — if Printavo natively rejects transitions from non-source statuses, no extra read is needed. Verify during implementation.

---

## 7. Idempotency of the retry endpoint

**Decision**: `/api/printavo-status-update` accepts `{ invoiceId, targetStatusId }`. Implementation:
1. Validate `targetStatusId` is in the allow-list (currently only `GOODS_IN_TRANSIT_STATUS_ID`).
2. Fetch the invoice's current status via Printavo.
3. If current status `=== targetStatusId` OR `!== READY_TO_ORDER_STATUS_ID`, return `{ ok: true, skipped: true, reason: 'already-in-or-past-target' }`.
4. Else perform `setInvoiceStatus` and return `{ ok: true, skipped: false, status: ... }`.

**Rationale**:
- Satisfies FR-010's idempotency requirement: retries after partial success do not double-update.
- The "already past Ready to Order" branch also covers the case where another admin has moved the invoice forward in Printavo concurrently — we silently treat it as success.

---

## Summary of resolved gaps

| Spec NEEDS CLARIFICATION / Open Question | Resolution |
|---|---|
| Server-side storage mechanism for Order Attribution Records | Vercel Blob, one JSON per SS order + per-invoice secondary index |
| `GOODS_IN_TRANSIT_STATUS_ID` exact value | Resolved at implementation time via Printavo admin; `const` in `lib/printavo.js` |
| Does `statusUpdate` mutation work for Invoices? | Yes — `OrderUnion` return type is structural evidence; `setInvoiceStatus` mirrors `setQuoteStatus` with `... on Invoice` |
| SS Activewear order-history endpoint shape | `GET /v2/orders/?ponumber=...&lines=true`; new `getSSOrdersByPO` helper |
| PO field normalization | Strip `#` and `, ` before querying |
| Cart dedup key | `(sku, sourceInvoiceId)` |
| Server-side chaining and per-invoice failure handling | `Promise.allSettled` inside `/api/place-order` |
| Retry endpoint idempotency | Status-read-then-update with allow-list gate |
| Constitutional VI interpretation | No `DRY_RUN`; safety via allow-list + read-then-write + logging |
