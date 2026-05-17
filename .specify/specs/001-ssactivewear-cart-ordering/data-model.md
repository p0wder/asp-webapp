# Phase 1 Data Model: SS Activewear Cart & Ordering Workflow

**Feature**: 001-ssactivewear-cart-ordering · **Date**: 2026-05-17

All entities below are client-side (JavaScript object literals) unless explicitly noted. There is no database schema for v1 — cart state lives in `localStorage`.

---

## Entities

### Cart

The root entity persisted to `localStorage` under key `asp.cart.v1`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | `number` | yes | Schema version. Starts at `1`. |
| `items` | `CartItem[]` | yes | Possibly empty. |
| `updatedAt` | `string` (ISO 8601) | yes | Refreshed on every mutation. Used for "last activity" UI and as a tiebreaker for the `storage` event. |

**Invariants**:

- No two `items` share the same `sku`. Adding an existing SKU increments `qty` instead of pushing a duplicate (FR-008).
- `items[].qty >= 1`. Setting qty to 0 must remove the item (FR-008a).
- `version` MUST match the consumer's expected version; on mismatch the cart is treated as empty (forward compatibility).

---

### CartItem

A single line in the cart, scoped to a specific SS Activewear SKU.

| Field | Type | Required | Notes |
|---|---|---|---|
| `sku` | `string` | yes | SS Activewear SKU, e.g. `B00060043` or `G500-S-WHITE`. Primary key within `Cart.items`. |
| `styleNumber` | `string` | yes | Printavo `itemNumber` (e.g. `5000`). Used for display & grouping by style. |
| `styleName` | `string` | yes | Human-readable style title from SS Activewear (e.g. "Unisex Heavy Cotton™ T-Shirt"). |
| `brandName` | `string` | yes | SS Activewear brand (e.g. "Gildan"). |
| `color` | `string` | yes | Color name (display label). |
| `size` | `string` | yes | Display size label (e.g. `S`, `M`, `2XL`). |
| `qty` | `number` (integer, ≥1) | yes | User-editable (FR-008a). |
| `unitPrice` | `number` | yes | Printavo line-item price (per R10). Not the SS Activewear dealer price. |
| `sourceInvoiceId` | `string` | yes | Printavo invoice `id`. Used for grouping at checkout (FR-009). |
| `sourceInvoiceVisualId` | `string` | yes | Printavo `visualId` (e.g. `1234`). Display label for the invoice grouping. |
| `sourceLineItemId` | `string` | yes | Printavo line item `id`. Used to render "Already in cart" hints on the order page. |
| `addedAt` | `string` (ISO 8601) | yes | When the user clicked Add to Cart. |

**Validation**:

- All `required: yes` fields MUST be present and non-empty strings (where typed `string`) for the item to be submitted.
- `qty` is an integer ≥ 1; non-integer or <1 values are coerced/rejected at the cart helper layer (`lib/cart.js`).

---

### InvoiceLineItem (read model)

Already exists in the Printavo response from `/api/ready-to-order` (`lineItemGroups.nodes[].lineItems.nodes[]`). Documented here for traceability; not modified by this feature.

Relevant fields used in this feature:

- `id` — primary key, used as `CartItem.sourceLineItemId`.
- `itemNumber` — style number (e.g. `5000`).
- `color` — color name.
- `description` — used as display fallback.
- `price` — unit price (used as `CartItem.unitPrice`).
- `sizes[]` — `{ size: 'size_l', count: 12 }[]`. Drives per-size SKU expansion.

---

### CatalogMatchResult

Returned per-line-item by the catalog lookup. Lives in component state on `/orders`; not persisted.

| Field | Type | Notes |
|---|---|---|
| `lineItemId` | `string` | Matches `InvoiceLineItem.id`. |
| `state` | `'pending' \| 'matched' \| 'sanmar' \| 'failed'` | State machine — see below. |
| `variants` | `CatalogVariant[]` | Populated only when `state === 'matched'`. One per (size, color) variant returned by SS Activewear. |
| `error` | `string \| null` | Populated only when `state === 'failed'`. |

**State machine** (one instance per line item):

```text
                       ┌──────────────┐
   initial render ──▶  │   pending    │
                       └──────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌─────────────┐  ┌─────────────┐  ┌──────────┐
      │   matched   │  │   sanmar    │  │  failed  │ ──▶ (Retry click) ──▶ pending
      └─────────────┘  └─────────────┘  └──────────┘
```

- `pending` — request in flight (or queued).
- `matched` — SS Activewear returned at least one variant for `(styleNumber, color)`. UI shows "Add to Cart".
- `sanmar` — SS Activewear returned zero variants (or the line item has no `itemNumber`). UI shows "Sanmar – Auto Order" badge. Terminal.
- `failed` — request errored (network, 5xx, etc). UI shows "Lookup failed — Retry". Retry transitions back to `pending`.

---

### CatalogVariant

A single SS Activewear SKU variant returned by the lookup. Used to populate `CartItem` on Add to Cart, and to power stock checks at checkout.

| Field | Type | Notes |
|---|---|---|
| `sku` | `string` | SS Activewear SKU. |
| `sizeName` | `string` | e.g. `S`, `M`, `2XL`. |
| `colorName` | `string` | Color name. |
| `qty` | `number` | Current available inventory at SS Activewear. Used for stock warnings. |
| `customerPrice` | `number` | Dealer price (informational only — not used for display in v1; see R10). |
| `styleName` | `string` | Title (e.g. `Unisex Heavy Cotton™ T-Shirt`). |
| `brandName` | `string` | e.g. `Gildan`. |

---

### StockWarning (checkout-screen only)

Computed at `/orders/checkout` mount; not persisted.

| Field | Type | Notes |
|---|---|---|
| `sku` | `string` | Matches `CartItem.sku`. |
| `requestedQty` | `number` | From `CartItem.qty`. |
| `availableQty` | `number` | Latest `CatalogVariant.qty` from the re-query. |
| `severity` | `'out-of-stock' \| 'insufficient'` | `out-of-stock` when `availableQty === 0`; `insufficient` when `0 < availableQty < requestedQty`. |

Actions on a stock warning (per FR-017):

- **Reduce to N** — set `CartItem.qty = availableQty`.
- **Remove** — delete the `CartItem`.
- **Proceed as-is** — no change; submission proceeds with the requested qty (SS Activewear may backorder or partially fulfill on its end).

---

## Cart operations (lib/cart.js)

Pure functions, no side effects (storage IO is isolated in `lib/cartStorage.js`).

| Function | Signature | Notes |
|---|---|---|
| `emptyCart()` | `() => Cart` | Returns a fresh `{ version: 1, items: [], updatedAt: now() }`. |
| `addItem(cart, item)` | `(Cart, CartItem) => Cart` | If `item.sku` already present, increments existing `qty` by `item.qty`. Otherwise appends. |
| `removeItem(cart, sku)` | `(Cart, string) => Cart` | Filters out the matching SKU. |
| `setQty(cart, sku, qty)` | `(Cart, string, number) => Cart` | If `qty <= 0`, equivalent to `removeItem`. Otherwise sets the qty (integer-clamped). |
| `groupByInvoice(cart)` | `(Cart) => { invoiceId, invoiceVisualId, items: CartItem[], subtotal: number }[]` | Used by the checkout summary (FR-009). |
| `totals(cart)` | `(Cart) => { itemCount: number, lineCount: number, grandTotal: number }` | `itemCount` sums `qty` (drives the badge in `<CartIndicator/>`). |

All functions are pure: same input → same output, no mutation of the input `cart`. Mutations to `localStorage` happen only via `lib/cartStorage.js#writeCart`.

---

## Relationships

```text
┌──────────────────────┐         ┌──────────────────────┐
│  InvoiceLineItem (P) │──────▶  │ CatalogMatchResult   │
└──────────────────────┘         │  state: pending /    │
       │                          │  matched / sanmar /  │
       │ (user clicks            │  failed              │
       │  Add to Cart on a       └──────────────────────┘
       │  matched variant)              │
       ▼                                 │ produces variants
┌──────────────────────┐                ▼
│       CartItem        │◀── populated from ──┐
│  sku (PK in cart)     │                     │
│  sourceLineItemId ────┼──▶ (back-ref to Printavo line item)
│  sourceInvoiceId ─────┼──▶ (groups at checkout)
└──────────────────────┘                     │
       ▲                                      │
       │                              ┌──────────────────────┐
       │ many                          │  CatalogVariant      │
       │                              │  (SS Activewear)      │
       │                              └──────────────────────┘
┌──────────────────────┐                     │ re-queried at
│        Cart           │                     │ checkout
│  items: CartItem[]    │                     ▼
│  version: 1           │              ┌──────────────────────┐
└──────────────────────┘              │   StockWarning       │
                                       │  (transient, checkout)│
                                       └──────────────────────┘

(P) = Printavo-owned read model
```

---

## Migration / versioning

Cart `version` starts at `1`. If a future feature changes the cart shape:

1. Bump the version constant.
2. On read, if persisted `version !== expected`, discard and start with `emptyCart()`. Do **not** attempt automatic migration in v1 — the cart is ephemeral by design.

---

## Out of scope (intentionally not modeled)

- **Persisted order history** — handled by Printavo / SS Activewear; this feature does not write to either.
- **Sanmar order queue** — explicitly out of scope per the spec.
- **User profile / saved carts** — no database in v1 (per Clarification Q2).
- **Idempotency token / order reference** — see R8.
