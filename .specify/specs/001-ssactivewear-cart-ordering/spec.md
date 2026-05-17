# Feature Specification: SS Activewear Cart & Ordering Workflow

**Feature Branch**: `001-ssactivewear-cart-ordering`

**Created**: 2026-05-17

**Status**: Draft

**Input**: User description: "On the orders page, each order card already shows invoice details. Add an SS Activewear ordering workflow: when viewing an order, each line item should be checked against the SS Activewear catalog. Items found in SS Activewear get an Add to Cart button. Items not found are flagged as Sanmar and handled separately via automated ordering. Users can add items from multiple invoices into a single persistent cart. A pre-checkout summary screen shows a breakdown of all cart items grouped by invoice and order with costs before the user submits the consolidated order to SS Activewear."

---

## Clarifications

### Session 2026-05-17

- Q: How should line items be matched against the SS Activewear catalog? → A: Match by style number only; items missing a style number are routed to Sanmar.
- Q: Where should the cart be persisted? → A: Browser localStorage only — cart is scoped per device/browser, not synced across devices or users.
- Q: What should happen when an SS Activewear catalog lookup fails or times out for a line item? → A: Show a "Lookup failed — Retry" state on the line item; do not classify as SS Activewear or Sanmar until the lookup resolves.
- Q: What happens to a cart item that is out of stock at SS Activewear at checkout? → A: Show stock warnings inline on the pre-checkout summary; the user explicitly chooses to proceed, reduce quantity, or remove per item before submitting.
- Q: Can users edit the quantity of a cart item after adding it? → A: Yes — users can freely edit any cart item's quantity (minimum 1; removing the item is equivalent to 0).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identify Sourceable Items on an Invoice (Priority: P1)

A user views an order card on the orders page. Each line item on the invoice is automatically checked against the SS Activewear catalog. Items that can be sourced from SS Activewear are clearly marked with an "Add to Cart" button. Items that cannot be found in SS Activewear are flagged as "Sanmar" — indicating they will be handled via a separate automated ordering process — so the user knows no manual action is needed for those items.

**Why this priority**: This is the foundation of the entire workflow. Without knowing which items are sourceable from SS Activewear vs. Sanmar, no ordering can take place. All downstream stories depend on this.

**Independent Test**: Can be fully tested by opening any order card with line items and verifying that each item is labeled either "Add to Cart" (SS Activewear) or "Sanmar – Auto Order", delivering clear sourcing visibility.

**Acceptance Scenarios**:

1. **Given** a user is viewing an order card with line items, **When** the order card loads, **Then** each line item displays either an "Add to Cart" button (if found in SS Activewear) or a "Sanmar – Auto Order" badge (if not found).
2. **Given** a line item is found in SS Activewear, **When** the user views the item, **Then** the item shows its SS Activewear availability status and an "Add to Cart" button.
3. **Given** a line item is not found in SS Activewear, **When** the user views the item, **Then** the item is clearly labeled as Sanmar with no manual action required.
4. **Given** an order has a mix of SS Activewear and Sanmar items, **When** the order card loads, **Then** both types are correctly identified and labeled independently.

---

### User Story 2 - Add Items from Multiple Invoices to a Persistent Cart (Priority: P2)

A user can add SS Activewear line items from one or more invoices to a shared cart. The cart persists across page navigation so the user can browse multiple orders and accumulate items before placing a single consolidated order. The cart shows a running count of items added.

**Why this priority**: The core value proposition is consolidating items from multiple invoices into one SS Activewear order. Without a persistent cart, users would have to place separate orders per invoice, losing efficiency.

**Independent Test**: Can be fully tested by adding items from two different invoices to the cart, navigating away, returning, and confirming all items are still present in the cart.

**Acceptance Scenarios**:

1. **Given** a user clicks "Add to Cart" on an SS Activewear line item, **When** the action completes, **Then** the item is added to the cart and the cart item count increments.
2. **Given** a user has items in the cart from Invoice A, **When** they navigate to Invoice B and add an item, **Then** the cart contains items from both invoices.
3. **Given** a user has items in the cart, **When** they navigate away from the orders page and return, **Then** the cart still contains all previously added items.
4. **Given** a user adds the same line item twice, **When** the second add occurs, **Then** the quantity increments rather than creating a duplicate entry.
5. **Given** a user wants to remove an item from the cart, **When** they remove it, **Then** the item is removed and the cart count decrements.

---

### User Story 3 - Pre-Checkout Summary Screen (Priority: P3)

Before submitting the order to SS Activewear, the user sees a pre-checkout summary screen that breaks down all cart items grouped by their source invoice/order. Each group shows the invoice identifier, the items from that invoice, quantities, and costs. A total cost is shown at the bottom. The user can review and confirm before submitting.

**Why this priority**: The summary screen prevents costly ordering mistakes by giving the user a final review opportunity. It also provides the business context (which items came from which invoice) needed for accurate fulfillment tracking.

**Independent Test**: Can be fully tested by adding items from multiple invoices to the cart, navigating to the summary screen, and verifying items are correctly grouped by invoice with accurate costs and totals.

**Acceptance Scenarios**:

1. **Given** a user has items in the cart from multiple invoices, **When** they navigate to the pre-checkout summary, **Then** items are grouped by invoice/order with the invoice identifier shown as a section header.
2. **Given** the summary screen is displayed, **When** the user reviews it, **Then** each item shows its name, quantity, unit cost, and line total.
3. **Given** the summary screen is displayed, **When** the user reviews it, **Then** a grand total is shown summing all items across all invoices.
4. **Given** the user is satisfied with the summary, **When** they click "Submit Order", **Then** the consolidated order is submitted to SS Activewear.
5. **Given** the user wants to make changes, **When** they click "Back" or edit the cart, **Then** they return to the cart/orders view with their cart intact.

---

### User Story 4 - Order Submission Confirmation (Priority: P4)

After submitting the consolidated order to SS Activewear, the user receives a confirmation that the order was placed successfully, including an order reference number or confirmation details from SS Activewear.

**Why this priority**: Confirmation closes the loop for the user and provides a reference for tracking. Lower priority because the core workflow (stories 1–3) delivers value even if confirmation is minimal.

**Independent Test**: Can be fully tested by completing a full cart-to-submission flow and verifying a success state is shown with order reference details.

**Acceptance Scenarios**:

1. **Given** a user submits the order, **When** SS Activewear accepts the order, **Then** a success confirmation is displayed with the SS Activewear order reference.
2. **Given** a user submits the order, **When** SS Activewear returns an error, **Then** a clear error message is shown and the cart is preserved so the user can retry.
3. **Given** an order is successfully submitted, **When** the confirmation is shown, **Then** the cart is cleared.

---

### Edge Cases

- What happens when an SS Activewear catalog lookup fails or times out for a line item? → The line item shows a "Lookup failed — Retry" control; it is not classified until the lookup resolves (see FR-016).
- What happens when a line item has no style/SKU information to match against the SS Activewear catalog?
- What happens when the user's cart is empty and they try to navigate to the pre-checkout screen?
- What happens when an item is added to the cart but goes out of stock in SS Activewear before checkout? → The pre-checkout summary shows a stock warning inline; user can proceed, reduce quantity, or remove the item (see FR-017).
- What happens when the SS Activewear API is unavailable during order submission?
- How does the system handle line items with custom/non-standard garment descriptions that don't map cleanly to catalog items?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST check each line item on an invoice against the SS Activewear catalog when an order card is viewed, matching by style number (exact match) against the SS Activewear style/SKU identifier.
- **FR-002**: System MUST display an "Add to Cart" button on line items whose style number is found in the SS Activewear catalog.
- **FR-003**: System MUST display a "Sanmar – Auto Order" indicator on line items not found in SS Activewear (including line items that have no style number), with no manual action required from the user.
- **FR-004**: Users MUST be able to add SS Activewear line items from any invoice to a shared persistent cart.
- **FR-005**: The cart MUST persist in browser localStorage so it survives page navigation and full reloads within the same browser/device. Cross-device/cross-browser sync is not required.
- **FR-006**: Users MUST be able to add items from multiple different invoices to the same cart before checkout.
- **FR-007**: Users MUST be able to remove individual items from the cart.
- **FR-008**: System MUST prevent duplicate cart entries by incrementing quantity when the same item is added again.
- **FR-008a**: Users MUST be able to edit the quantity of any cart item to any positive integer (minimum 1). Setting quantity to 0 MUST be equivalent to removing the item (FR-007).
- **FR-009**: System MUST provide a pre-checkout summary screen that groups cart items by their source invoice/order.
- **FR-010**: The pre-checkout summary MUST display item name, quantity, unit cost, line total, and grand total for all items.
- **FR-011**: Users MUST be able to submit the consolidated cart as a single order to SS Activewear from the pre-checkout screen.
- **FR-012**: System MUST display a success confirmation with SS Activewear order reference after successful submission.
- **FR-013**: System MUST display a clear error message and preserve the cart if order submission fails.
- **FR-014**: System MUST clear the cart after a successful order submission.
- **FR-015**: System MUST show a running cart item count visible from the orders page.
- **FR-016**: When an SS Activewear catalog lookup for a line item fails or times out, the system MUST display a "Lookup failed — Retry" control on that line item and MUST NOT classify the item as SS Activewear or Sanmar until the lookup resolves successfully. The user MUST be able to retry the lookup per line item.
- **FR-017**: The pre-checkout summary MUST display current SS Activewear stock status for each cart item and MUST flag items that are out of stock or have insufficient stock for the requested quantity. The user MUST be able to proceed with the order as-is, reduce the requested quantity, or remove the affected item per line — submission MUST NOT be blocked solely because some items are out of stock.

### Key Entities

- **Cart**: A collection of line items selected for SS Activewear ordering; persists across navigation; contains items from one or more invoices.
- **Cart Item**: A single line item added to the cart; references its source invoice/order, includes quantity, unit cost, and SS Activewear catalog details.
- **Invoice/Order**: An existing Printavo invoice displayed as an order card; the source context for line items added to the cart.
- **Line Item**: A garment/product entry on an invoice; has a sourcing status (SS Activewear or Sanmar) determined by catalog lookup.
- **SS Activewear Catalog Match**: The result of checking a line item's style number against the SS Activewear product catalog; determines whether the item can be manually ordered or is auto-routed to Sanmar. A line item with no style number is treated as a non-match (Sanmar).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can identify which items on an invoice are sourceable from SS Activewear vs. Sanmar within 5 seconds of opening an order card.
- **SC-002**: Users can add items from 3 or more invoices to a single cart without losing any previously added items.
- **SC-003**: The pre-checkout summary accurately reflects all cart items grouped by invoice with correct costs 100% of the time.
- **SC-004**: Users can complete the full workflow from viewing an order to submitting a consolidated SS Activewear order in under 5 minutes.
- **SC-005**: Order submission errors are communicated clearly enough that users can identify the problem and retry without losing their cart.
- **SC-006**: 90% of line items are correctly classified as SS Activewear or Sanmar on first catalog lookup.

---

## Assumptions

- The existing SS Activewear catalog search functionality in `lib/ssActivewear.js` will be used or extended for line item matching.
- Line items on invoices contain enough product information (style number, brand, or description) to attempt a catalog match against SS Activewear.
- Items not found in SS Activewear are assumed to be Sanmar products; the Sanmar automated ordering process is out of scope for this feature and handled separately.
- Cart persistence uses browser localStorage scoped to the device/browser; server-side cart storage and cross-device sync are out of scope for v1.
- The user is authenticated (login required) before accessing the orders page and this workflow.
- Costs displayed in the pre-checkout summary come from the existing invoice/line item data in Printavo, not from SS Activewear pricing.
- The SS Activewear order submission uses the existing `app/api/place-order/route.js` endpoint or a new endpoint following the same pattern.
- Mobile responsiveness is required consistent with the rest of the application.
