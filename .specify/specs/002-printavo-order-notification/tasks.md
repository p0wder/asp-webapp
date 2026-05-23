---

description: "Task list for feature: Printavo Goods-In-Transit Status Notification"
---

# Tasks: Printavo Goods-In-Transit Status Notification

**Input**: Design documents in `.specify/specs/002-printavo-order-notification/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/*, quickstart.md

**Tests**: This repo has no automated test framework (per the constitution's YAGNI principle); tests are NOT included as tasks. Validation is via the manual `quickstart.md` flow at the end (T021).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. The MVP is US1 alone (auto-advance fully ordered invoices); US2/US3/US4 layer on incrementally.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files, no dependencies on incomplete tasks — safe to parallelize
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4). Setup/Foundational/Polish phases have no story label.
- All paths are project-relative from `/Users/scottie/repos/asp-webapp/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pre-implementation prerequisites that don't change code.

- [ ] T001 Source the production "Goods In Transit" Printavo status ID. Approaches: (a) inspect Printavo admin UI → status configuration → copy the numeric ID; (b) write a one-off `scripts/find-printavo-status-id.mjs` that runs `query { statuses { id name } }` against Printavo and prints the matching status. Record the ID for use in T006. Do NOT commit a placeholder.
- [ ] T002 Verify `BLOB_READ_WRITE_TOKEN` is present in `.env.local` (locally) and in Vercel project settings (preview + production). Already required by `app/api/upload/route.js` — confirm, don't add. No new env vars are introduced by this feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure changes that ALL user stories depend on. These MUST land before any US1+ work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. Without these changes, attribution flows nowhere and the entire derivation chain is broken.

- [ ] T003 [P] Fix the cart dedup key in `lib/cart.js:32-38` to use composite `(sku, sourceInvoiceId)` instead of `sku` alone (FR-016). The same SKU from two different source invoices MUST produce two distinct cart rows. Quantity-merge behavior continues to apply only when both `sku` and `sourceInvoiceId` match. Verify by walking the function manually with a two-invoice same-SKU example in a comment.
- [ ] T004 [P] Update the checkout submit payload in `app/orders/checkout/page.jsx:137-143` to include `sourceInvoiceId`, `sourceInvoiceVisualId`, and `sourceLineItemId` on every `lines[i]` entry sent to `/api/place-order` (FR-017). Do NOT remove or change the existing `identifier`, `qty`, `warehouseAbbr`, `poNumber`, `comments`, or `paymentProfileId` fields.
- [ ] T005 [P] Update `proxy.js` `config.matcher` to include `/api/printavo-status-update` and `/api/orders-partial-state` so unauthenticated requests to those routes receive 401 at the edge (Principle VII layer 1). The routes themselves are created in later tasks; the matcher entries can land first.

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Auto-Advance Fully Ordered Invoices to "Goods In Transit" (Priority: P1) 🎯 MVP

**Goal**: After SS Activewear cart checkout, any source invoice that is 100% ordered via SS Activewear is automatically advanced from "Ready to Order" to "Goods In Transit" in Printavo. Confirmation screen shows the per-invoice outcome.

**Independent Test**: Place an SS Activewear order for a cart containing every line item from a single SS-Activewear-only invoice at default quantities. Verify (a) the confirmation screen says "Status updated to Goods In Transit" for the invoice, (b) Printavo admin shows the invoice in "Goods In Transit", (c) a Vercel Blob at `ss-order-attribution/<orderRef>.json` exists with the submitted lines. (Quickstart Section 1.)

### Implementation for User Story 1

- [ ] T006 [P] [US1] In `lib/printavo.js`, add `export const GOODS_IN_TRANSIT_STATUS_ID = '<numeric ID from T001>';` and `export const READY_TO_ORDER_STATUS_ID = '256605';` (move the existing constant here from `app/api/ready-to-order/route.js`). Add an in-module `ALLOWED_INVOICE_STATUS_TRANSITIONS` Set containing the single allowed transition string. Add `export async function setInvoiceStatus(invoiceId, targetStatusId)` that (a) throws a clear error if `${READY_TO_ORDER_STATUS_ID}->${targetStatusId}` is not in the allow-list, (b) runs the `statusUpdate(parentId, statusId)` mutation with selection `... on Invoice { id visualId status { id name } } ... on Quote { id visualId status { id name } }`, (c) logs request and response per Principle V. Also update `app/api/ready-to-order/route.js:7` to import `READY_TO_ORDER_STATUS_ID` from `lib/printavo.js` instead of defining it locally.
- [ ] T007 [P] [US1] Create new file `lib/orderClassification.js` — pure module (MUST NOT import IO modules per Principle IV). Export `classifyInvoices({ cartItems, invoices, currentStatusByInvoiceId })` returning `InvoiceClassification[]` per the rules in `data-model.md`: `fully-ordered` when every line on the invoice has `source === 'ss-activewear'` AND `cartQty >= invoiceQty`; `partial` otherwise; `skipped-not-ready` when `currentStatusByInvoiceId[invoiceId] !== READY_TO_ORDER_STATUS_ID`. Include JSDoc typedefs for `InvoiceClassification` and `LineItemStatus`.
- [ ] T008 [P] [US1] Create new file `lib/orderAttribution.js` — IO module. Use `@vercel/blob` (`put`, `head`, `get` per its v2.x API). Export: `writeRecord(record)` which writes `ss-order-attribution/<ssOrderRef>.json` AND read-modify-writes `ss-order-attribution/by-invoice/<visualId>.json` for each distinct invoice in `record.lines`; `readRecord(orderRef)` for point reads (returns `null` if not found); `listRecordsForInvoice(visualId)` which reads the per-invoice index then returns the list of `orderRef`s. Validate the record schema on write — reject `lines: []`, missing required fields, or non-unique `(sku, sourceInvoiceId, sourceLineItemId)` within a record. Log writes only (Principle V).
- [ ] T009 [US1] Extend `app/api/place-order/route.js` to implement the FR-021 server-side chain: (1) auth (existing) + new validation that every line includes `sourceInvoiceId`, `sourceInvoiceVisualId`, `sourceLineItemId` (return 400 on missing); (2) call `createSSOrder` (existing); (3) on SS success, server-side: fetch full invoice details (`{ id, visualId, lineItems: [{ id, itemNumber, sizes }], status: { id, name } }`) for each unique `sourceInvoiceId` via a new `getInvoicesByIds(invoiceIds)` helper in `lib/printavo.js` (one batched GraphQL query). The server-fetch closes the FR-006 race window between page-load and submit; cost is one extra Printavo round-trip per checkout, acceptable for admin-tool cadence (analyze C1 resolution). (4) Call `classifyInvoices({ cartItems: req lines, invoices: fetched, currentStatusByInvoiceId: derived from fetched })`; (5) `Promise.allSettled(qualifyingInvoices.map(inv => setInvoiceStatus(inv.id, GOODS_IN_TRANSIT_STATUS_ID)))`; (6) construct the `OrderAttributionRecord` from the request + SS response (include `ssOrderNumber`, `ssInvoiceNumber`, `ssPoNumber`, `submittedAt`, `submittedBy: session.user.email`) and call `writeRecord(...)`; (7) build the aggregated response per `contracts/place-order.md` and return 200. Each per-invoice failure logs with `[place-order]` prefix per Principle V. **If the orchestration exceeds ~80 lines (Principle III)**, extract it into `lib/placeOrderChain.js` and reduce the route to: auth → validate → `placeOrderChain(...)` → respond. Depends on T006, T007, T008.
- [ ] T010 [US1] Update the confirmation panel UI in `app/orders/checkout/page.jsx` (the existing success-state render around `lines 174-194`) to consume the new aggregated response shape from T009. For each entry in `perInvoice`, render a chip with the invoice visualId, the classification, and the status-update outcome ("Status updated to Goods In Transit" / "Skipped — already past Ready to Order" / "Skipped — partial" / "Status update failed — Retry"). Show a brief "Updating Printavo…" indicator during the request. Retry-button wiring is added in T017 (US4); for now show the failure chip with text only. Cart-clear behavior remains conditional on SS success (existing). Depends on T009.

**Checkpoint**: User Story 1 fully functional. Place a fully-SS-Activewear order → status flips to "Goods In Transit"; partial / non-Ready orders silently skip with a chip on the confirmation screen. MVP achievable here.

---

## Phase 4: User Story 2 — Surface Partially Ordered Invoices for Follow-Up (Priority: P1)

**Goal**: On the confirmation screen, partial invoices show a detailed per-line-item breakdown (already-ordered vs. still-needed; SS vs. Sanmar source) so the user can amend later.

**Independent Test**: Place an SS Activewear order for a cart that contains only some of an invoice's line items, OR where the invoice has Sanmar items, OR where the user reduced a cart quantity below invoice qty. Verify the confirmation screen shows a "Partial — needs follow-up" section with the per-line-item table. (Quickstart Sections 2 and 3.)

### Implementation for User Story 2

- [ ] T011 [US2] In the confirmation panel UI in `app/orders/checkout/page.jsx`, add a "Partial — needs follow-up" section that iterates over `perInvoice` entries where `classification === 'partial'`. For each, render a group with the invoice visualId as header and a table of `partialItemsSummary.lineItems`: columns are description, ordered qty (cartQty for items submitted; 0 for missing/Sanmar), still-needed qty, source label ("SS Activewear", "Sanmar — Auto Order", "Lookup pending"). The classifier already produces `PartialItemsSummary` as part of T009's response — no server change needed. Depends on T010.

**Checkpoint**: User Stories 1 and 2 both functional. The confirmation screen now gives a complete picture of every invoice in the submission.

---

## Phase 5: User Story 3 — Persistent Partial Visibility on the Orders Page (Priority: P1)

**Goal**: Returning to the orders page (even across sessions/devices) reveals each "Ready to Order" invoice's partial-coverage state via a derived badge and drill-down. State is derived from SS Activewear order history JOIN local Order Attribution Records — no app-side persistence beyond the attribution records already written in US1.

**Independent Test**: After completing a partial submission, close the browser, clear localStorage, reopen the orders page. Verify the affected invoice shows "Partial — N items still need ordering" and the drill-down accurately reports per-line-item already-ordered vs. still-needed quantities. (Quickstart Section 4.)

### Implementation for User Story 3

- [ ] T012 [P] [US3] In `lib/ssActivewear.js`, add `export async function getSSOrdersByPO(visualIdOrPoNumber, opts = {})`. Normalize the input: split on `, `, strip leading `#` from each token, trim, URL-encode each, comma-join for the path. Construct `GET ${SS_API_BASE}/orders/${normalized}?lines=true&mediaType=json` using the existing Basic auth header (mirror the pattern at `lib/ssActivewear.js:84`). Parse the response; surface `X-Rate-Limit-Remaining` as a property on the returned object so callers can rate-limit-defer. Log on error only (Principle V, read-only call). Return `{ orders: [...], rateLimit: { remaining: <n> } }`.
- [ ] T013 [P] [US3] In `lib/orderClassification.js`, add and export `computePartialItemsSummary({ invoice, priorAttributionRecords })` returning a `PartialItemsSummary` object or `null` if there is no shortfall. Pure function. Sum per-`sourceLineItemId` `qty` across all matching attribution-record lines; compute `stillNeeded = max(invoiceQty - alreadyOrdered, 0)`. Sanmar/unresolved-lookup lines contribute `alreadyOrdered: 0` and `source` is preserved.
- [ ] T014 [US3] Create new route `app/api/orders-partial-state/route.js` implementing the contract in `contracts/orders-partial-state.md`. Steps: auth via `getServerSession` (401 if missing); validate request body shape (400 on bad input); for each invoice in the request, in parallel via `Promise.allSettled`: (a) `await listRecordsForInvoice(visualId)`; (b) if empty → `state: 'no-coverage'`; (c) else `Promise.all(orderRefs.map(readRecord))` → on any null/throw → `state: 'unavailable'` with `unavailableReason: 'attribution-record-missing' | 'attribution-record-corrupt'`; (d) call `getSSOrdersByPO(visualId)` for corroboration → on throw/timeout → `state: 'unavailable'` with `'ss-history-lookup-failed'`; (e) call `computePartialItemsSummary({ invoice, priorAttributionRecords })` → `state: 'partial'` if non-null else `'fully-covered'`. If SS response indicates `X-Rate-Limit-Remaining < 10`, set `corroborationSkipped: true` on remaining unprocessed invoices and skip the SS call (rely on local records only). Return aggregated response. Route stays thin (Principle III) — heavy lifting in `lib/`. Depends on T012, T013, T008.
- [ ] T015 [US3] Update `app/orders/page.jsx` to call `/api/orders-partial-state` once when the visible invoice list loads (and on manual refresh) with the "Ready to Order" invoices' `sourceInvoiceVisualId` + `lineItems[]` (built from existing client-side data: `lineItemGroups.nodes[].lineItems.nodes[]` per `app/orders/page.jsx:567-672`, mapped to `{ sourceLineItemId, sku, description, invoiceQty, source }` where `source` comes from the existing SS-Activewear catalog classification state already in the page). Render a partial badge on each invoice card per the API `state`: `partial` → "Partial — N items still need ordering" with drill-down on click (table of `PartialItemsLineItem`); `unavailable` → "Partial status unavailable — Retry" with a button that re-fires the API call for that invoice only; `no-coverage` / `fully-covered` → no badge. Drill-down rendered as a collapsible section beneath the existing invoice details. Depends on T014.

**Checkpoint**: User Stories 1, 2, and 3 all functional. Partial state is now durable across sessions and devices.

---

## Phase 6: User Story 4 — Resilient Status Update on Printavo Failure (Priority: P2)

**Goal**: If the Printavo status update fails after a successful SS Activewear order, the confirmation screen surfaces a per-invoice retry control that uses a dedicated, idempotent endpoint and never re-submits the SS order.

**Independent Test**: Temporarily break `GOODS_IN_TRANSIT_STATUS_ID` to force a failure; submit a fully-ordered cart; verify confirmation shows "Status update failed — Retry"; revert the ID; click Retry; verify the status flips to "Goods In Transit" and a second Retry click reports the idempotent skip. (Quickstart Section 6.)

### Implementation for User Story 4

- [ ] T016 [US4] Create new route `app/api/printavo-status-update/route.js` implementing the contract in `contracts/printavo-status-update.md`. Steps: auth via `getServerSession` (401); validate `invoiceId` non-empty + `targetStatusId` in the in-code allow-list (400 if not); fetch the invoice's current status from Printavo (use a small new helper in `lib/printavo.js` that returns just `{ id, status: { id, name } }` for an invoice id — or reuse the helper added in T009); if `currentStatus.id === targetStatusId` OR `currentStatus.id !== READY_TO_ORDER_STATUS_ID` → return `{ ok: true, skipped: true, reason: 'already-in-or-past-target', currentStatus }` (200); else call `setInvoiceStatus(invoiceId, targetStatusId)` and return `{ ok: true, skipped: false, previousStatus, newStatus }` (200). Log prefix `[printavo-status-update]`. Route stays thin. Depends on T006.
- [ ] T017 [US4] In `app/orders/checkout/page.jsx`, wire a per-invoice "Retry" button visible when `perInvoice[i].statusUpdate.outcome === 'failed'`. On click, POST `{ invoiceId, targetStatusId: GOODS_IN_TRANSIT_STATUS_ID }` to `/api/printavo-status-update`. Update the chip in place based on the response (`skipped: true` → "Status already updated"; `ok: true, skipped: false` → "Status updated to Goods In Transit"; non-200 → keep "Status update failed — Retry" with the new error). Depends on T016 and T010.

**Checkpoint**: All four user stories functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Sign-off checks and final manual validation.

- [ ] T018 [P] Verify `README.md` env-var documentation. No new env vars were added by this feature; confirm the section is unchanged and accurate. If the doc was stale already, do NOT include unrelated fixes in this PR.
- [ ] T019 [P] Verify `proxy.js` `config.matcher` includes both `/api/printavo-status-update` and `/api/orders-partial-state` entries from T005 (Principle VII layer 1 sign-off).
- [ ] T020 [P] Verify `lib/ssActivewear.js:335` still hardcodes `testOrder: true` (Constitution Principle VI sign-off — production-real orders are an explicit code change, not a config toggle).
- [ ] T021 Run all 9 sections of `quickstart.md` end-to-end against a Vercel preview deployment for this branch. Record pass/fail per section; any failure blocks the merge to `master`. Update `.specify/specs/002-printavo-order-notification/checklists/requirements.md` with the validation results.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No code dependencies. T001 produces a value used by T006; T002 is verification only.
- **Phase 2 (Foundational)**: Depends on Phase 1 completion. Blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2 completion. Independent of US2/US3/US4 except as noted below.
- **Phase 4 (US2)**: Depends on T010 (US1). Server-side data is already produced by T009; this is a UI extension.
- **Phase 5 (US3)**: Depends on T008 (US1's attribution writes — without writes there is nothing to read). Otherwise independent.
- **Phase 6 (US4)**: Depends on T006 (shared `setInvoiceStatus`) and T010 (UI for failure-state chips).
- **Phase 7 (Polish)**: Depends on all desired user stories being complete.

### User Story Dependencies (summary)

| Story | Hard deps on prior story tasks |
|---|---|
| US1 | Phase 2 (T003, T004, T005) |
| US2 | T010 |
| US3 | T008 (only — partial-state derivation needs attribution records to exist) |
| US4 | T006, T010 |

### Within Each User Story

- Models / lib modules before services
- Pure (`lib/orderClassification.js`) before IO (`lib/orderAttribution.js`) is NOT required — they live in different files. But the pure module MUST NOT import the IO module (Principle IV).
- Library functions before the routes that use them (T006/T007/T008 before T009; T012/T013 before T014; T006 before T016).
- Routes before the UI components that call them (T009 before T010; T014 before T015; T016 before T017).

### Parallel Opportunities

- **Foundational [P]**: T003, T004, T005 are different files with no inter-dependency — all three can run in parallel.
- **US1 lib layer [P]**: T006, T007, T008 are three different new files — all three can run in parallel before T009.
- **US3 lib layer [P]**: T012, T013 are different files (and T013 only touches `lib/orderClassification.js` which T007 created — T013 lands in a later phase so there is no race) — both can run in parallel before T014.
- **Polish [P]**: T018, T019, T020 are pure verification — fully parallel.
- **Cross-story parallel**: If multiple developers are working, US3 (T012+T013) can be developed in parallel with US2 (T011) because they touch different files; both depend only on US1's earlier tasks completing.

---

## Parallel Example: User Story 1 lib layer

```bash
# After Foundational lands, three lib modules can be built in parallel:
Task: "T006 — Add setInvoiceStatus + GOODS_IN_TRANSIT_STATUS_ID to lib/printavo.js"
Task: "T007 — Create pure module lib/orderClassification.js with classifyInvoices"
Task: "T008 — Create IO module lib/orderAttribution.js with writeRecord/readRecord/listRecordsForInvoice"
# Then converge on T009 (extend app/api/place-order/route.js) which depends on all three.
```

## Parallel Example: Foundational

```bash
# All three Foundational tasks are independent files:
Task: "T003 — Fix cart dedup in lib/cart.js"
Task: "T004 — Add attribution fields to checkout payload in app/orders/checkout/page.jsx"
Task: "T005 — Add new route matchers to proxy.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002) — note that T001 is essential; without the status ID nothing works.
2. Complete Phase 2: Foundational (T003, T004, T005) — these are pre-conditions for *any* attribution-aware flow.
3. Complete Phase 3: User Story 1 (T006 → T010 via T007/T008/T009).
4. **STOP and VALIDATE**: Run Quickstart Section 1, then 7, then 8 (the SS-failure edge case is co-located with US1's chain logic).
5. Ship MVP — partial invoices simply show "Skipped — partial" on the confirmation screen with no detail; partial badges on the orders page are not yet rendered. The auto-advance is correct and safe.

### Incremental Delivery After MVP

1. Add US2 (T011) → ship → partial-items breakdown now visible on confirmation screen.
2. Add US3 (T012 → T015) → ship → orders page now persistently surfaces partial state.
3. Add US4 (T016 → T017) → ship → retry control closes the failure-recovery loop.
4. Finally, T018–T021 polish and full quickstart validation.

### Parallel Team Strategy

With two developers post-Foundational:

- Developer A: US1 (T006–T010) → then US4 (T016–T017)
- Developer B: idle until T008 lands → US3 (T012–T015) → then US2 (T011) once T010 is in

Single-developer baseline: linear US1 → US2 → US3 → US4 → polish.

---

## Notes

- [P] tasks = different files, no dependencies — safe to parallelize.
- [Story] label maps each task to its user story for traceability.
- Each user story is independently testable per its **Independent Test** description above and the matching quickstart section.
- No automated test framework in this repo — verification is via the manual quickstart.
- Commit after each task or logical group (e.g., commit after T003+T004+T005 as a single "foundational attribution plumbing" commit; commit after T006/T007/T008 individually since they're independent).
- The "Goods In Transit" status ID (T001) is the only true blocker — without it, T006 cannot be merged. Source it before merging the feature branch even if intermediate tasks are merged earlier.
- Constitution principles VI and VII have explicit sign-off tasks in Phase 7 (T019, T020). Do not skip them.
