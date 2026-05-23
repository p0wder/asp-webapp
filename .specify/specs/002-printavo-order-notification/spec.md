# Feature Specification: Printavo Goods-In-Transit Status Notification

**Feature Branch**: `001-printavo-order-notification`

> Note: The spec directory is `.specify/specs/002-printavo-order-notification/` to avoid colliding with the existing `001-ssactivewear-cart-ordering` spec dir. The git branch and the spec directory number are independent per spec-kit conventions.

**Created**: 2026-05-23

**Status**: Draft

**Input**: User description: "Lets say I place the order once we check out via the websites cart is there away to send a notification to printavo to change status from ready to order to order in transit. the interesting edge case is that we partially ordered the invoices items. we need a good behavior to let the user know this so they can amend the order to place it in full at whatever time that may be. especially because we only support ssactivewear. maybe as a phase 1 approach we can implement this for orders we know are 100% ordered through ssactivewear"

---

## Clarifications

### Session 2026-05-23

- Q: When a user reduces a cart item's quantity below the invoice's requested quantity, is the invoice "partial"? → A: Yes — any cart quantity less than the invoice's requested quantity for any line item flags the invoice as partial; Printavo status is NOT changed.
- Q: After the confirmation screen is dismissed, do partial invoices get any persistent indicator on the orders page? → A: Yes — partial state is **derived** (not stored locally) by querying SS Activewear order history and matching prior orders' PO field against the Printavo invoice's visualId. On the orders page, each "Ready to Order" invoice card displays a partial badge with already-ordered vs. still-needed quantity per line item.
- Q: How should we resolve the multi-invoice attribution precision gap (same SKU across two invoices, cart-layer dedup, lost attribution at API boundary)? → A: Persist server-side attribution at submission time. Fix the cart to key by `(sku, sourceInvoiceId)`; forward `sourceInvoiceId` and `sourceLineItemId` to `/api/place-order`; persist a per-SS-order attribution record so partial-state derivation = SS order history JOIN local attribution. Precision gap eliminated.
- Q: When is the Printavo status update invoked relative to the SS Activewear order submission? → A: Server-side chained inside `/api/place-order`. The endpoint performs the SS submission, then for each qualifying invoice performs the Printavo status update, then writes the Order Attribution Record, then returns aggregated per-invoice results. A small separate endpoint exposes per-invoice retry for failed status updates without re-submitting the SS order.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-Advance Fully Ordered Invoices to "Goods In Transit" (Priority: P1)

After a user submits a consolidated SS Activewear order from the cart, any Printavo invoice whose entire set of line items was included in that submission is automatically advanced from "Ready to Order" to "Goods In Transit" in Printavo. The user does not have to leave the app and change statuses by hand.

**Why this priority**: This is the primary value of the feature — eliminating the manual Printavo step that today is the user's responsibility after every SS Activewear order. Without this, the rest of the workflow (cart, checkout) leaves the user with extra busywork and a stale Printavo board.

**Independent Test**: Can be fully tested by placing an SS Activewear order for a cart that contains every line item from a single invoice and verifying the Printavo invoice's status flips from "Ready to Order" to "Goods In Transit" within a few seconds of order submission.

**Acceptance Scenarios**:

1. **Given** an invoice has 100% SS Activewear-matched line items and the user added all of them to the cart, **When** the SS Activewear order is successfully submitted, **Then** that invoice's Printavo status changes from "Ready to Order" to "Goods In Transit".
2. **Given** a single submitted order spans multiple invoices that are each 100% ordered, **When** the SS Activewear order is successfully submitted, **Then** every qualifying invoice has its Printavo status updated independently.
3. **Given** an invoice qualifies for auto-advance, **When** the Printavo status update is in progress, **Then** the user sees a clear "Updating Printavo…" indicator for that invoice on the order confirmation screen.
4. **Given** an invoice qualifies for auto-advance, **When** the Printavo status update succeeds, **Then** the user sees a "Status updated to Goods In Transit" confirmation on the confirmation screen tied to that invoice.

---

### User Story 2 - Surface Partially Ordered Invoices for Follow-Up (Priority: P1)

After SS Activewear order submission, any invoice that is *not* fully ordered through SS Activewear (because some of its line items are Sanmar, or because the user did not add all SS Activewear items to the cart, or because the user removed/reduced items before checkout) is clearly surfaced on the confirmation screen as **partial**. The Printavo status is **not** changed for these invoices. The user gets a concise summary of which items on that invoice were ordered and which were left behind so they can come back later and complete the order.

**Why this priority**: This is co-equal with Story 1: without a clear partial-state surface, users would either (a) wrongly assume an invoice is fully ordered and forget to amend it, or (b) avoid auto-advance altogether because they cannot trust the status. The partial behavior is what makes auto-advance safe to ship.

**Independent Test**: Can be fully tested by placing an SS Activewear order for a cart that contains only some of an invoice's line items (or where the invoice has Sanmar items) and verifying (a) the invoice's Printavo status does *not* change, and (b) the confirmation screen lists this invoice under a "Partial — needs follow-up" section with the unordered items enumerated.

**Acceptance Scenarios**:

1. **Given** an invoice has one or more Sanmar line items, **When** the SS Activewear order is submitted, **Then** that invoice appears in a "Partial — needs follow-up" group on the confirmation screen and its Printavo status remains unchanged.
2. **Given** an invoice has all SS Activewear line items but the user only added some to the cart, **When** the SS Activewear order is submitted, **Then** that invoice appears under "Partial — needs follow-up" with a list of the line items that were *not* included in this submission.
3. **Given** an invoice was added to the cart but the user later removed one of its items before checkout, **When** the SS Activewear order is submitted, **Then** that invoice is classified as partial.
4. **Given** an invoice is classified as partial, **When** the user views the confirmation screen, **Then** they can clearly see (a) which items were ordered, (b) which items still need to be ordered, and (c) that Printavo status was *not* changed for this invoice.
5. **Given** an invoice is partial, **When** the user later returns to the orders page, **Then** that invoice still shows under "Ready to Order" (no status change occurred) so it can be revisited and completed.

---

### User Story 3 - Persistent Partial Visibility on the Orders Page (Priority: P1)

When a user returns to the orders page after any prior cart checkout, every "Ready to Order" invoice that already has *some* SS Activewear coverage but is not yet fully ordered displays a clear partial badge with a drill-down showing what's already been ordered (qty per line item) and what still needs to be ordered. The state is derived from SS Activewear order history joined against locally-stored Order Attribution Records, so it survives device changes and browser sessions.

**Why this priority**: This is what makes the partial classification actionable over time. Without persistent visibility, a user who placed a partial order yesterday has no in-app reminder today of what still needs follow-up. This story is co-equal with Stories 1 and 2 because the entire safety net for partial orders depends on it.

**Independent Test**: Can be fully tested by placing a partial SS Activewear order for an invoice, closing the browser, opening a fresh session, and verifying the orders page shows the affected invoice with a partial badge that, when expanded, shows accurate already-ordered vs. still-needed quantities per line item.

**Acceptance Scenarios**:

1. **Given** an invoice in "Ready to Order" has at least one prior SS Activewear order referencing its visualId, **When** the user opens the orders page, **Then** the invoice card shows a "Partial — N items still need ordering" badge.
2. **Given** the partial badge is displayed, **When** the user expands it, **Then** they see a per-line-item table: line description, already-ordered qty (summed across all prior SS orders, joined via Order Attribution Records), still-needed qty, and source classification (SS Activewear vs. Sanmar).
3. **Given** an invoice has no prior SS Activewear coverage, **When** the user opens the orders page, **Then** no partial badge is shown for that invoice.
4. **Given** the SS Activewear order-history lookup fails for an invoice, **When** the orders page renders, **Then** the invoice card shows "Partial status unavailable — Retry" instead of a guess-based badge.
5. **Given** an invoice has prior SS Activewear coverage but its corresponding Order Attribution Record is missing, **When** the orders page renders, **Then** the invoice card shows "Partial status unavailable — Retry" rather than rendering a potentially incorrect badge.

---

### User Story 4 - Resilient Status Update on Printavo Failure (Priority: P2)

If the SS Activewear order is successfully placed but the Printavo status update fails for one or more qualifying invoices (network error, Printavo API issue, status ID mismatch, etc.), the SS Activewear order is *not* rolled back (it cannot be) and the user is shown a clear, per-invoice error with a one-click retry. The system never silently swallows a status-update failure.

**Why this priority**: The SS Activewear submission and the Printavo status change are two separate external calls; failures on the second must not corrupt the user's mental model of what is "in transit". A retry surface keeps the user in control without blocking the rest of the confirmation flow.

**Independent Test**: Can be fully tested by simulating a Printavo API failure during the status update step and verifying the confirmation screen shows a per-invoice "Status update failed — Retry" control while still showing the SS Activewear order as successful.

**Acceptance Scenarios**:

1. **Given** the SS Activewear order succeeded and the Printavo status update fails, **When** the confirmation screen renders, **Then** the user sees a clear "Status update failed for invoice [#]" message with a retry control, and the SS Activewear order success is still shown.
2. **Given** a status update previously failed, **When** the user clicks "Retry", **Then** the system reattempts the Printavo status update and reports success or another failure without re-submitting the SS Activewear order.
3. **Given** the user dismisses the confirmation screen with one or more outstanding status-update failures, **When** they next visit the orders page, **Then** the affected invoices still appear under "Ready to Order" (because the status change never landed), so nothing is silently lost.

---

### Edge Cases

- What happens when an invoice was already in a Printavo status other than "Ready to Order" at the moment of order submission (e.g., the user updated it in Printavo concurrently)? → The system MUST NOT overwrite a non-"Ready to Order" status; the invoice is treated as partial and surfaced for review.
- What happens when the user submits an SS Activewear order whose cart contains line items from zero "Ready to Order" invoices (e.g., all source invoices are already in a later status)? → The order still submits to SS Activewear; no Printavo status updates are attempted; the confirmation screen states "No Printavo statuses updated".
- What happens when the SS Activewear order itself fails? → No Printavo status updates are attempted (FR-007). The cart is preserved per the existing checkout flow.
- What happens when an invoice's line items are duplicated across the cart (same item added twice from the same invoice)? → The classification logic counts the line item as "ordered" if any cart row sourced from that invoice line item was included in the submission.
- What happens when the user lowered a cart item's quantity below the invoice's requested quantity? → The invoice is treated as **partial** (the user did not place the full requested quantity for at least one line item); Printavo status is NOT changed; the under-ordered line item is enumerated in the partial-items summary with the cart qty and the still-needed qty so the user can amend later. See FR-003 and the Partial Items Summary entity.
- What happens when the SS Activewear order is split into multiple SS Activewear submissions (e.g., across warehouses)? → All split submissions are treated as a single logical "cart checkout" for the purpose of classifying invoices as fully ordered vs. partial.
- What happens when a prior SS Activewear order's PO field contains a comma-separated list of multiple Printavo invoice visualIds (as the existing checkout flow already does at `app/orders/checkout/page.jsx:137-141`)? → The derivation MUST match the invoice's visualId as a substring of the PO field, AND MUST join against the corresponding Order Attribution Record (FR-018) to retrieve the per-line `sourceInvoiceId` mapping. This eliminates the over-attribution risk: each SS-order line item is attributed to the exact source invoice and line item it came from, regardless of how many invoices share that SS order.
- What happens to historical SS Activewear orders placed before this feature ships (no Order Attribution Record exists)? → Per FR-020, those invoices render as "Partial status unavailable — Retry" rather than a guess-based badge. Planning may choose to backfill attribution from cart history or document the limitation; this is out of scope for Phase 1 functional correctness.
- What happens when no prior SS Activewear orders reference an invoice's visualId? → No partial badge is shown; the invoice appears as an untouched "Ready to Order" entry.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After a successful SS Activewear cart checkout, the system MUST classify each source invoice represented in the cart as either **fully ordered via SS Activewear** or **partial**.
- **FR-002**: An invoice MUST be classified as **fully ordered via SS Activewear** when (a) every line item on that invoice has a successful SS Activewear catalog match (no Sanmar items, no unresolved lookups), AND (b) every such line item was included in the just-submitted SS Activewear order at a cart quantity **greater than or equal to** the invoice's requested quantity for that line item.
- **FR-003**: An invoice MUST be classified as **partial** when any of the following are true: it contains one or more Sanmar (non-SS Activewear) line items; it contains one or more SS Activewear line items that were not added to the cart; it contains one or more SS Activewear line items that were removed from the cart before checkout; or it contains one or more SS Activewear line items whose cart quantity is **less than** the invoice's requested quantity for that line item.
- **FR-004**: For each invoice classified as **fully ordered via SS Activewear** AND whose current Printavo status is "Ready to Order", the system MUST send a status update to Printavo changing the invoice from "Ready to Order" to "Goods In Transit".
- **FR-005**: For each invoice classified as **partial**, the system MUST NOT send any status update to Printavo. The invoice remains in its current status.
- **FR-006**: The system MUST NOT overwrite a Printavo invoice status that is anything other than "Ready to Order" at the time of the update. If a qualifying invoice has moved out of "Ready to Order" since the user opened the orders page, the system MUST treat it as **`skipped-not-ready`** (a distinct classification from `partial` — see Invoice Classification entity in data-model.md) and skip the status update without raising an error.
- **FR-007**: The system MUST NOT attempt any Printavo status update if the SS Activewear order submission fails.
- **FR-008**: The order confirmation screen MUST display, for each source invoice in the just-submitted order, its classification result: "Status updated to Goods In Transit", "Partial — needs follow-up", "Skipped — already past Ready to Order", or "Status update failed — Retry".
- **FR-009**: For partial invoices, the confirmation screen MUST list (a) the items that were included in the submitted SS Activewear order and (b) the items that still need to be ordered, with enough context for the user to act on them later.
- **FR-010**: For invoices whose Printavo status update fails after a successful SS Activewear order, the system MUST display a per-invoice retry control on the confirmation screen and MUST allow the user to reattempt the status update without re-submitting the SS Activewear order. Retry MUST be implemented via a dedicated server endpoint (separate from `/api/place-order`) that accepts an invoice id and target status id and is idempotent (no-op if the invoice is already in or past the target status).
- **FR-011**: The system MUST log each Printavo status update attempt (success or failure) for traceability, including the invoice identifier, the previous status, the attempted target status, and the outcome.
- **FR-012**: The system MUST handle multi-invoice carts correctly: per-invoice classification, per-invoice status update, and per-invoice confirmation reporting are independent — one invoice's failure or partial state MUST NOT block another invoice's update.
- **FR-013**: On the orders page, each invoice in "Ready to Order" status MUST display a **partial badge** when prior SS Activewear orders exist that referenced the invoice's visualId in the PO field AND the cumulative previously-ordered quantity for any line item is less than that line item's invoice quantity (or any line item has no prior SS Activewear order coverage).
- **FR-014**: The partial badge MUST be **derived**, not stored in app-side state. Derivation queries the SS Activewear order history filtered by the Printavo invoice's visualId appearing in the PO field of past SS orders. The badge MUST expand into a drill-down that shows, per line item: already-ordered cumulative quantity (across all matching SS orders), still-needed quantity (invoice qty minus already-ordered, floored at 0), and the source classification (SS Activewear vs. Sanmar).
- **FR-015**: When the SS Activewear order-history lookup fails, times out, or is unavailable for a given invoice, the orders page MUST NOT render a stale or misleading partial badge for that invoice. Instead, it MUST render an explicit "Partial status unavailable — Retry" indicator that does not assert any conclusion about completeness.
- **FR-016**: The cart MUST treat `(sku, sourceInvoiceId)` as the unique key for cart rows, replacing today's `sku`-only key at `lib/cart.js:32-38`. The same SKU originating from two different source invoices MUST NOT be merged into a single cart row. Quantity-merge behavior continues to apply *within* a single `(sku, sourceInvoiceId)` pair.
- **FR-017**: When the cart is submitted via `/api/place-order`, the request payload MUST include `sourceInvoiceId` and `sourceLineItemId` on every line, in addition to the existing `identifier` and `qty`. The API boundary MUST NOT drop or flatten these fields.
- **FR-018**: After a successful SS Activewear order submission, the system MUST persist a server-side **Order Attribution Record** keyed by the SS Activewear order reference (e.g., `orderNum` or normalized `poNumber`) containing, for each line: `sku`, submitted `qty`, `sourceInvoiceId`, and `sourceLineItemId`. The record MUST survive across user sessions and devices.
- **FR-019**: Per-invoice partial-state derivation (FR-013/FR-014) MUST be computed as `SS Activewear order history (filtered by invoice visualId in PO field) JOIN local Order Attribution Records` — never from the PO field alone. The join MUST sum already-ordered quantities per `sourceLineItemId` so the partial badge and drill-down show line-item-level shortfall without any cross-invoice over-attribution.
- **FR-020**: If an Order Attribution Record is missing or corrupted for an SS order that the history query returns, the system MUST treat any invoice referenced in that SS order's PO field as having "Partial status unavailable — Retry" rather than rendering a potentially incorrect badge. (Reuses the FR-015 unavailable state.)
- **FR-021**: The `/api/place-order` endpoint MUST perform the following steps server-side, in order, as a single user-facing request: (1) submit the SS Activewear order, (2) on SS success, classify each source invoice (per FR-001/FR-002/FR-003), (3) for each fully-ordered-via-SS-Activewear invoice currently in "Ready to Order", call the Printavo status update to "Goods In Transit", (4) persist the Order Attribution Record (FR-018), and (5) return an aggregated response containing the SS order details and a per-invoice classification + status-update result. Steps (3) and (4) MUST be attempted even if some Printavo updates fail — failures MUST be reported per-invoice and MUST NOT block the remaining steps from running. If the SS submission in step (1) fails, no subsequent step is performed (per FR-007).
- **FR-022**: The Order Attribution Record write (step 4 of FR-021) MUST succeed for any record to be considered durably stored. If the write fails after a successful SS submission, the response MUST indicate the attribution write failure clearly so the user understands future partial-state derivation for those invoices may be unavailable (per FR-020) until corrected.

### Key Entities

- **Source Invoice**: A Printavo invoice referenced by one or more cart items at the moment of checkout. Has a current Printavo status (e.g., "Ready to Order") and a complete set of line items.
- **Cart Submission**: The set of line items submitted to SS Activewear as a single checkout (may include items from multiple source invoices). Used to determine, for each source invoice, which of its line items were ordered vs. left behind.
- **Invoice Classification**: A per-invoice result of comparing the cart submission to the source invoice's full line-item set. One of: *fully ordered via SS Activewear*, *partial*, *skipped (not in "Ready to Order")*.
- **Status Update Result**: The outcome of attempting to advance a qualifying invoice to "Goods In Transit": *updated*, *failed (retryable)*, *not attempted*.
- **Partial Items Summary**: For each partial invoice, the list of line items on that invoice that still need follow-up, presented to the user on the confirmation screen. For each entry, includes: the invoice line item, the quantity included in this submission (0 if not added or removed), and the still-needed quantity (invoice qty minus cart qty, floored at 0). Sanmar items are listed with "ordered: 0, still needed: <invoice qty>, source: Sanmar (auto-order)" so the user knows no manual SS Activewear follow-up is required for those.
- **Persistent Partial-State Derivation**: A per-invoice computation, performed when the orders page renders, that (a) queries SS Activewear order history for any prior order whose PO field contains the invoice's visualId, (b) joins each returned SS line item against the local Order Attribution Record for that SS order to recover the original `sourceInvoiceId` and `sourceLineItemId`, (c) sums per-`sourceLineItemId` quantities across all matching SS orders, and (d) compares against the invoice's requested quantities to determine whether the invoice has any shortfall. Used to render the partial badge (FR-013) and its drill-down (FR-014).
- **Order Attribution Record**: A server-side record persisted at the moment of a successful SS Activewear order submission. Keyed by the SS Activewear order reference (orderNum or normalized poNumber). Contains, for each submitted line, the SKU/identifier, the submitted quantity, the source Printavo invoice id, and the source Printavo line item id. Survives across user sessions and devices. Used as the join table for partial-state derivation (FR-019).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For invoices that qualify as fully ordered via SS Activewear, the Printavo status is updated to "Goods In Transit" within 10 seconds of the SS Activewear order submission succeeding, in at least 95% of attempts.
- **SC-002**: 100% of partial invoices are correctly identified and surfaced as "needs follow-up" on the confirmation screen — no partial invoice is ever silently auto-advanced.
- **SC-003**: For multi-invoice carts, all eligible invoices are processed independently — a single Printavo failure does not block status updates on other invoices in the same checkout.
- **SC-004**: Users can identify, within 10 seconds of seeing the confirmation screen, which of their submitted invoices were fully ordered vs. partial and what (if anything) still needs follow-up.
- **SC-005**: When a Printavo status update fails, the user can retry it from the confirmation screen and succeed (assuming the underlying issue is transient) without re-submitting the SS Activewear order.
- **SC-006**: Zero cases of an invoice's Printavo status being silently overwritten when it was not in "Ready to Order" at the time of the update.
- **SC-007**: When the user returns to the orders page after any prior partial submission, every "Ready to Order" invoice with prior SS Activewear coverage displays an accurate partial badge (or an explicit "unavailable" indicator if order-history lookup fails) — no silent omissions.
- **SC-008**: The partial-badge drill-down shows already-ordered vs. still-needed quantity per line item within 3 seconds of opening it, in at least 95% of attempts.

---

## Assumptions

- "Ready to Order" and "Goods In Transit" are existing Printavo statuses configured for this account; their status IDs are stable and can be referenced by the system. (The "Ready to Order" ID is already in use as `READY_TO_ORDER_STATUS_ID` in the existing orders flow.)
- Printavo exposes a status-update operation that this system can call on behalf of the authenticated user (the existing `setQuoteStatus` pattern in `lib/printavo.js` is precedent for an analogous invoice/order status update).
- The cart workflow defined in spec `001-ssactivewear-cart-ordering` (line-item classification as SS Activewear vs. Sanmar, multi-invoice cart, per-item quantity edits) is in place and is the source of truth for what was submitted to SS Activewear.
- A user-edited cart quantity below the invoice's requested quantity DOES make the invoice "partial" (see FR-003). The user's explicit intent (per the original feature request) is to be reminded of any shortfall — both missing line items AND under-quantity line items — so they can amend the order to place it in full later. The invoice's requested quantity is the source of truth for "fully ordered".
- The SS Activewear order may be split into multiple SS API submissions internally (e.g., per warehouse) but is treated as a single logical "cart checkout" for the purposes of this feature.
- Phase 1 scope is intentionally limited to the fully-ordered-via-SS-Activewear case. Workflows for completing partial invoices (re-checkout, mixed Sanmar+SS ordering, automatic follow-up reminders) are out of scope for this spec and may be addressed in a later phase.
- Mobile responsiveness for the confirmation screen is required, consistent with the rest of the application.
- The user is authenticated (login required) at the time of cart checkout, and that session is sufficient to call Printavo on their behalf.
- The Printavo invoice **visualId** placed in the SS Activewear order's PO field at checkout time (existing convention at `app/orders/checkout/page.jsx:137-141`) is the canonical association key for deriving per-invoice partial state. The existing convention prefixes each visualId with `#` and joins multiple invoices with `", "` (example PO: `"#1234, #1235"`).
- The SS Activewear API exposes `GET /v2/orders/{identifier}?lines=true` where the identifier may be a PO number; the response includes `lines[]` with per-SKU `qty ordered`. Auth, base URL, and similar GET patterns are already in place in `lib/ssActivewear.js`. The PO-field literal (with `#` and spaces) must be normalized before being passed as the lookup identifier.
- The hardcoded `testOrder: true` in `createSSOrder` (`lib/ssActivewear.js:335`) may affect what prior orders are returned by the order-history query during development; planning must confirm test-order visibility before relying on derivation in non-production environments.
- The multi-invoice attribution gap is resolved by storing per-line `sourceInvoiceId` / `sourceLineItemId` server-side at submission time (FR-016 / FR-017 / FR-018) and joining against this Order Attribution Record at derivation time (FR-019). The current cart-layer SKU-merge behavior at `lib/cart.js:32-38` is a correctness defect that this feature MUST fix as part of FR-016 — it is not pre-existing functionality being preserved.
- The exact server-side storage mechanism for Order Attribution Records (new database table, dedicated JSON store, or other persistence) is an implementation choice for planning. Whatever is chosen MUST satisfy: durable across sessions/devices, keyed by SS Activewear order reference, and queryable per Printavo invoice id.
- The Printavo status update happens **server-side, chained inside `/api/place-order`** (per FR-021). The confirmation screen renders results from the aggregated response; retries on failed status updates go to a separate dedicated endpoint (per FR-010). This guarantees that if the user closes the browser between SS success and Printavo update, the update has already been attempted server-side — closing the browser cannot orphan a successful SS order without an attempted Printavo update.
- The Printavo `statusUpdate(parentId, statusId)` mutation returns `OrderUnion` (a union including both Quote and Invoice variants), making it the same mutation used today for quotes (`setQuoteStatus` in `lib/printavo.js`). A new helper (e.g., `setInvoiceStatus`) reusing this mutation with an `... on Invoice { id visualId status { id name } }` selection is the expected implementation pattern.
