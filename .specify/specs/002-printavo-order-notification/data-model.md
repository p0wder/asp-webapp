# Phase 1 Data Model: Printavo Goods-In-Transit Status Notification

**Date**: 2026-05-23

This feature introduces one new persisted entity (Order Attribution Record) and several in-flight value objects (computed at request time, not stored). Existing entities (Cart, Cart Item, Invoice, Line Item) are documented elsewhere — only the additions and modifications are captured here.

---

## Persisted entities

### Order Attribution Record

The single new durable entity. Persisted to Vercel Blob immediately after a successful SS Activewear order submission, keyed by SS order reference. Survives across sessions, devices, and deployments (FR-018).

**Storage**: Vercel Blob

**Key**: `ss-order-attribution/{orderRef}.json` where `orderRef` is the SS `orderNum` (preferred). If `orderNum` is unavailable, falls back to the normalized PO number prefixed with `po-` (e.g., `po-1234-1235`).

**Schema** (JSON):

```json
{
  "schemaVersion": 1,
  "ssOrderRef": "string — SS orderNum or po-prefixed fallback",
  "ssOrderNumber": "string | null — the literal SS orderNumber returned by POST /v2/orders/",
  "ssInvoiceNumber": "string | null — the literal SS invoiceNumber returned by POST /v2/orders/",
  "ssPoNumber": "string — the exact poNumber sent to SS (e.g., '#1234, #1235')",
  "submittedAt": "string — ISO 8601 timestamp of successful SS submission",
  "submittedBy": "string — admin email from session (audit only)",
  "lines": [
    {
      "sku": "string — SS Activewear identifier",
      "qty": "number — submitted quantity",
      "sourceInvoiceId": "string — Printavo invoice GraphQL node ID",
      "sourceInvoiceVisualId": "string — Printavo invoice visualId (without #)",
      "sourceLineItemId": "string — Printavo line item ID"
    }
  ]
}
```

**Invariants**:
- `lines` MUST NOT be empty.
- Within a single record, `(sku, sourceInvoiceId, sourceLineItemId)` MUST be unique. (Two cart rows with the same triple would have been merged in the cart layer per FR-016.)
- `sourceInvoiceId`, `sourceInvoiceVisualId`, and `sourceLineItemId` are all required on every line — no nulls. The API boundary MUST reject any incoming line missing these (FR-017).
- Once written, the record is **immutable**. If an SS order is amended or canceled in SS, derivation reflects this via the SS GET /orders/ corroborating call, not by mutating the local record.

**Lifecycle**:
1. **Created** atomically after `createSSOrder` returns success, inside `/api/place-order` (FR-021 step 4).
2. **Read** during partial-state derivation (per-invoice on orders page render; per-invoice on confirmation screen for the just-submitted SS order).
3. **Deleted** — out of scope for Phase 1. Records accumulate indefinitely; Phase 2+ may add pruning by age or by `submittedAt`.

### Order Attribution Index (per-invoice secondary)

A small companion blob that lets us list all SS orders touching a given Printavo invoice without scanning every Order Attribution Record. Maintained transactionally with each new record.

**Storage**: Vercel Blob

**Key**: `ss-order-attribution/by-invoice/{visualId}.json` where `visualId` is the Printavo invoice visualId (without `#`).

**Schema** (JSON):

```json
{
  "schemaVersion": 1,
  "visualId": "string — Printavo invoice visualId without #",
  "orderRefs": ["string — list of ssOrderRefs that included this invoice"]
}
```

**Invariants**:
- `orderRefs` is append-only within Phase 1; deduplication is the writer's responsibility (use a Set semantically).
- Reading a missing index file is **valid** and means "no SS Activewear coverage for this invoice yet"; the orders page treats this as "no partial badge" (FR-013, edge case "no prior SS Activewear orders reference an invoice's visualId").

**Lifecycle**:
1. **Read-modify-write** during the Order Attribution Record write step. Each unique `sourceInvoiceId.visualId` in the new record's `lines` adds the new `ssOrderRef` to the corresponding index file.
2. **Read** during partial-state derivation as the first lookup step.
3. **Race risk**: Two simultaneous SS submissions touching the same invoice could both read-modify-write the index, losing one update. Mitigation: this is an admin tool with a single-digit-user count; concurrent submissions to the *same* invoice are extremely unlikely. If observed, mitigate in Phase 2 with a per-invoice lock or by deriving the index from a periodic scan.

---

## In-flight value objects (computed, not stored)

### Invoice Classification

Per-invoice result from the pure `classifyInvoices` function. Returned in the `/api/place-order` aggregated response and used by the confirmation screen.

```js
/**
 * @typedef {Object} InvoiceClassification
 * @property {string} sourceInvoiceId — Printavo invoice GraphQL node ID
 * @property {string} sourceInvoiceVisualId — Printavo invoice visualId (without #)
 * @property {'fully-ordered' | 'partial' | 'skipped-not-ready'} status
 * @property {Array<LineItemStatus>} lineItems
 * @property {string | null} reason — human-readable explanation if partial or skipped
 */

/**
 * @typedef {Object} LineItemStatus
 * @property {string} sourceLineItemId
 * @property {string} sku
 * @property {string} description
 * @property {number} invoiceQty — requested quantity per Printavo
 * @property {number} cartQty — quantity in this submission (0 if not added or removed)
 * @property {number} stillNeeded — max(invoiceQty - cartQty, 0)
 * @property {'ss-activewear' | 'sanmar' | 'unresolved-lookup'} source
 * @property {boolean} includedInThisSubmission
 */
```

**Derivation rules** (encoded in `lib/orderClassification.js`):
- `status = 'fully-ordered'` iff every `lineItems[i].source === 'ss-activewear'` AND every `lineItems[i].cartQty >= lineItems[i].invoiceQty` (FR-002).
- `status = 'partial'` iff at least one of: any `source === 'sanmar'`, any `source === 'unresolved-lookup'`, any `cartQty < invoiceQty` (FR-003).
- `status = 'skipped-not-ready'` iff the invoice's current Printavo status is not `READY_TO_ORDER_STATUS_ID` (FR-006).

### Status Update Result

Per-invoice outcome of the Printavo status update step, returned in the same aggregated response.

```js
/**
 * @typedef {Object} StatusUpdateResult
 * @property {string} sourceInvoiceId
 * @property {string} sourceInvoiceVisualId
 * @property {'updated' | 'failed' | 'skipped'} outcome
 * @property {'fully-ordered-eligible' | 'partial' | 'skipped-not-ready' | 'not-attempted-ss-failed'} reason
 * @property {string | null} errorMessage — present iff outcome === 'failed'
 * @property {string | null} retryEndpoint — present iff outcome === 'failed'; the URL to POST to for retry
 */
```

### Partial Items Summary

Returned both in the `/api/place-order` confirmation response (for the just-submitted SS order's source invoices) and by `/api/orders-partial-state` (for any invoice on the orders page). Same shape in both contexts.

```js
/**
 * @typedef {Object} PartialItemsSummary
 * @property {string} sourceInvoiceId
 * @property {string} sourceInvoiceVisualId
 * @property {number} totalItemsStillNeeded — sum of stillNeeded across all line items
 * @property {Array<PartialItemsLineItem>} lineItems
 */

/**
 * @typedef {Object} PartialItemsLineItem
 * @property {string} sourceLineItemId
 * @property {string} sku
 * @property {string} description
 * @property {number} invoiceQty
 * @property {number} alreadyOrdered — cumulative qty across all matching SS orders (joined via attribution records)
 * @property {number} stillNeeded — max(invoiceQty - alreadyOrdered, 0)
 * @property {'ss-activewear' | 'sanmar' | 'unresolved-lookup'} source
 */
```

---

## Modifications to existing entities

### CartItem (modified)

The cart-row dedup key changes per FR-016. The CartItem schema itself is unchanged — only `lib/cart.js`'s merge function is updated.

**Before** (today, `lib/cart.js:32-38`): merge key = `item.sku`. Adding the same SKU from a second invoice silently overwrites `sourceInvoiceId` and `sourceLineItemId`.

**After**: merge key = `(item.sku, item.sourceInvoiceId)`. The same SKU from two different invoices results in two distinct cart rows. The same SKU from the same invoice (regardless of `sourceLineItemId`) continues to merge with quantity addition.

### Printavo invoice mutation surface

`lib/printavo.js` gains:

```js
export const GOODS_IN_TRANSIT_STATUS_ID = '<NUMERIC_ID>'; // to be filled in at implementation time
const ALLOWED_INVOICE_STATUS_TRANSITIONS = new Set([
  `${READY_TO_ORDER_STATUS_ID}->${GOODS_IN_TRANSIT_STATUS_ID}`,
]);

export async function setInvoiceStatus(invoiceId, targetStatusId) { /* ... */ }
```

The allow-list enforces the constitutional safety interpretation in plan.md (no `DRY_RUN` const; equivalent safety via allow-list).

### SS Activewear client surface

`lib/ssActivewear.js` gains:

```js
/**
 * Fetch SS Activewear orders that match the given PO number (Printavo
 * invoice visualId). Normalizes the input (strips `#`, trims, URL-encodes).
 *
 * @param {string} visualIdOrPoNumber — e.g., "1234" or "#1234, #1235"
 * @param {object} [opts]
 * @param {boolean} [opts.linesOnly=true] — include line items (sets ?lines=true)
 * @returns {Promise<Array<SSOrderSummary>>}
 */
export async function getSSOrdersByPO(visualIdOrPoNumber, opts) { /* ... */ }
```

### Order Attribution adapter

`lib/orderAttribution.js` (new) — the IO module, sibling pattern to `cart.js`/`cartStorage.js`:

```js
export async function writeRecord(record) { /* writes blob + updates per-invoice index */ }
export async function readRecord(orderRef) { /* point-read */ }
export async function listRecordsForInvoice(visualId) { /* reads index → reads each record */ }
```

### Order Classification (pure module)

`lib/orderClassification.js` (new) — pure, MUST NOT import IO modules per Principle IV:

```js
/**
 * Pure function. Given cart, invoices, and known prior attribution records,
 * compute per-invoice classification.
 *
 * @param {Object} params
 * @param {Array<CartItem>} params.cartItems
 * @param {Array<Invoice>} params.invoices
 * @param {Array<OrderAttributionRecord>} params.priorAttributionRecords — pre-fetched by caller
 * @returns {Array<InvoiceClassification>}
 */
export function classifyInvoices({ cartItems, invoices, priorAttributionRecords }) { /* ... */ }

/**
 * Pure function. Given an invoice and its prior attribution records,
 * compute the per-line-item shortfall (used by orders-page partial badge).
 *
 * @returns {PartialItemsSummary | null} — null when no shortfall
 */
export function computePartialItemsSummary({ invoice, priorAttributionRecords }) { /* ... */ }
```

---

## Entity relationship diagram

```text
Printavo Invoice (visualId, id, lineItems[])
   │
   │ 1 ── many
   ▼
Order Attribution Index (by visualId)
   │
   │ 1 ── many (orderRefs)
   ▼
Order Attribution Record (by ssOrderRef)
   │
   │ 1 ── many (lines)
   ▼
Attribution Line (sku, qty, sourceInvoiceId, sourceLineItemId)
                                            │
                                            └── joins back to Invoice's line item

SS Activewear Order History (queried by PO = invoice visualId)
   │
   │ corroborates
   ▼
SS Order (orderNumber, lines[]) — used to confirm record reflects reality
```

Partial-state derivation flow for one invoice (per FR-019):
1. Read Order Attribution Index by `visualId` → list of `ssOrderRef`s.
2. For each `ssOrderRef`, read the Order Attribution Record blob.
3. Query SS Activewear `GET /v2/orders/?ponumber=<visualId>&lines=true` to corroborate. **Mandatory per FR-019** — failure yields `state: 'unavailable'`, not a silent fallback to local-only.
4. Sum per-`sourceLineItemId` quantities across all records.
5. Compare against the invoice's `lineItems[i].items` (Printavo's requested qty) to derive `stillNeeded`.
6. Return `PartialItemsSummary` if any `stillNeeded > 0`, else null (no partial badge).
