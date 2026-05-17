# Contract: POST /api/place-order (existing — reused, NOT modified)

**Status**: EXISTING — no changes required for this feature.

**File**: `app/api/place-order/route.js` (already implemented)

**Auth**: Requires authenticated session via `getServerSession(authOptions)`.

This contract is documented here for traceability — the cart submission flow ([User Story 4](../spec.md)) terminates at this endpoint. Modifying it is out of scope for the SS Activewear Cart feature.

---

## Request

```json
{
  "shippingAddress": {            // optional — defaults to ASP shop address
    "name": "string",
    "address": "string",
    "city": "string",
    "state": "string",            // 2-letter abbreviation
    "zip": "string",
    "country": "string"
  },
  "lines": [
    {
      "identifier": "string",     // SS Activewear SKU (CartItem.sku)
      "qty": 0,                   // positive integer
      "warehouseAbbr": "string"   // optional; auto-selected by SS Activewear when omitted
    }
  ],
  "poNumber": "string",           // optional
  "comments": "string"            // optional
}
```

---

## Response — Success (200)

```json
{
  "success": true,
  "order": { /* raw SS Activewear /v2/orders/ response */ }
}
```

---

## Response — Validation error (400)

```json
{ "error": "string" }
```

Returned when `lines` is missing/empty, `identifier` is missing, `qty < 1`, or `shippingAddress` is partially provided.

---

## Response — Unauthorized (401)

```json
{ "error": "Unauthorized" }
```

---

## Response — Upstream error (500)

```json
{ "error": "string" }
```

Wraps SS Activewear API errors. Cart MUST be preserved client-side so the user can retry (FR-013).

---

## How this feature uses it

1. User clicks **Submit Order** on `/orders/checkout`.
2. Client maps `Cart.items[].sku/qty` to `lines[]`.
3. Client calls `POST /api/place-order` with the consolidated `lines` array, plus an optional `comments` summarizing source-invoice IDs (e.g., `"Consolidated from invoices #1234, #1235"`).
4. On `success: true`: clear cart (FR-014), show confirmation with `order.orderID` / `order.invoiceNumber` (FR-012).
5. On error: keep cart intact, surface `error` message (FR-013).

---

## Constraints carried over

- `testOrder: true` is hardcoded in `lib/ssActivewear.js#createSSOrder`. This feature does NOT change that. When eventually flipped to live, see R8 in `research.md` for idempotency follow-up.
- `shippingAddress` defaults to `SS_DEFAULT_SHIPPING_ADDRESS` (the ASP shop). This feature does not surface a shipping-address picker.
