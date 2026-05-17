# Contract: POST /api/ss-catalog-lookup

**Status**: NEW — to be created in this feature

**File**: `app/api/ss-catalog-lookup/route.js`

**Auth**: Requires authenticated session via `getServerSession(authOptions)`. Returns `401 Unauthorized` if no session.

**Body type**: `application/json`

---

## Purpose

Batch-resolve Printavo invoice line items against the SS Activewear product catalog. Returns one classification result per requested item plus, for matched items, the SKU/qty/price variants needed to populate the cart and surface stock warnings.

This endpoint is consumed by:

- `/orders` page — at invoice-card render, to classify each line item as SS Activewear or Sanmar.
- `/orders/checkout` page — on mount, to refresh stock for cart items before submission.

---

## Request

```json
{
  "items": [
    {
      "lineItemId": "string",            // required — opaque pass-through ID for client correlation
      "styleNumber": "string | null",     // Printavo itemNumber; may be null/empty for line items without one
      "color": "string | null"            // Printavo color label; may be null for color-agnostic lookups
    }
  ]
}
```

**Constraints**:

- `items` MUST be a non-empty array. Empty arrays return `400`.
- Each item MUST include `lineItemId`.
- `styleNumber` may be `null`, `""`, or absent — these MUST be classified `sanmar` without an upstream API call (per FR-003).

---

## Response — Success (200)

```json
{
  "success": true,
  "results": [
    {
      "lineItemId": "string",          // echoed back for client correlation
      "state": "matched | sanmar",     // matched ⇒ variants populated; sanmar ⇒ variants empty
      "variants": [
        {
          "sku": "string",             // SS Activewear SKU (used as place-order identifier)
          "sizeName": "string",        // e.g. "S", "2XL"
          "colorName": "string",
          "qty": 0,                    // current SS Activewear inventory
          "customerPrice": 0.0,        // dealer cost (informational; not displayed in v1)
          "styleName": "string",
          "brandName": "string"
        }
      ]
    }
  ]
}
```

**Notes**:

- `state` MUST be `matched` only when at least one variant matches `(styleNumber, color)`. Zero matches ⇒ `sanmar`.
- `variants` MUST be `[]` when `state === 'sanmar'`.
- If `color` was provided in the request, the server filters to variants whose `colorName` matches (case-insensitive). If `color` was null, all variants for the style are returned.

---

## Response — Validation error (400)

```json
{ "error": "items must be a non-empty array." }
```

Other validation errors return analogous `{ "error": string }` payloads with `400`.

---

## Response — Unauthorized (401)

```json
{ "error": "Unauthorized" }
```

---

## Response — Per-item upstream failure (200 with `failed` state)

If the SS Activewear API returns an error (5xx, timeout, etc.) for a *specific* item, the endpoint MUST return `200` with that item's `state` set to `failed` and an `error` string. Other items in the batch MUST still resolve normally.

```json
{
  "success": true,
  "results": [
    { "lineItemId": "abc", "state": "matched", "variants": [/* … */] },
    { "lineItemId": "def", "state": "failed",  "error": "SS Activewear API error 503: Service Unavailable" }
  ]
}
```

This shape satisfies FR-016 (per-line-item retry). The client retries by re-submitting only the failed `lineItemId`s.

---

## Response — Whole-request server error (500)

Reserved for failures unrelated to a specific item (e.g., missing env vars, JSON parse error in the handler). Returns:

```json
{ "error": "string" }
```

---

## Example

**Request**:

```json
{
  "items": [
    { "lineItemId": "li_1", "styleNumber": "5000", "color": "White" },
    { "lineItemId": "li_2", "styleNumber": "",     "color": "Navy"  },
    { "lineItemId": "li_3", "styleNumber": "G500", "color": "Red"   }
  ]
}
```

**Response**:

```json
{
  "success": true,
  "results": [
    {
      "lineItemId": "li_1",
      "state": "matched",
      "variants": [
        { "sku": "G500-S-WHT", "sizeName": "S",  "colorName": "White", "qty": 1240, "customerPrice": 2.13, "styleName": "Unisex Heavy Cotton™ T-Shirt", "brandName": "Gildan" },
        { "sku": "G500-M-WHT", "sizeName": "M",  "colorName": "White", "qty": 980,  "customerPrice": 2.13, "styleName": "Unisex Heavy Cotton™ T-Shirt", "brandName": "Gildan" }
      ]
    },
    {
      "lineItemId": "li_2",
      "state": "sanmar",
      "variants": []
    },
    {
      "lineItemId": "li_3",
      "state": "failed",
      "error": "SS Activewear API error 503: Service Unavailable"
    }
  ]
}
```

---

## Side effects

None — read-only against the SS Activewear catalog. No writes to any system.

---

## Logging

- `console.log('[ss-catalog-lookup] batch size:', items.length)` at entry.
- `console.warn('[ss-catalog-lookup] item failed:', lineItemId, error)` per failed item.
- No PII in logs — `styleNumber` and `color` only.

---

## Performance budget

- p95 latency MUST be < 2 s for batches of up to 10 items, to keep SC-001 (5-second classification) achievable.
- Implementation MUST coalesce items sharing the same `styleNumber` into a single upstream `?style=` request to minimize SS Activewear API calls.
