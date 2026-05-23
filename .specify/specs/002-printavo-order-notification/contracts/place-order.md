# Contract: `POST /api/place-order` (extended)

**Route file**: `app/api/place-order/route.js`

**Auth**: `getServerSession(authOptions)` required (existing). Returns 401 if missing.

**Status**: This contract **extends** the existing `/api/place-order` endpoint. The shape adds new required line fields and a new aggregated response. The existing request fields (`shippingAddress`, `poNumber`, `comments`, `paymentProfileId`) are unchanged.

---

## Request

```json
{
  "shippingAddress": {
    "name": "ASP Merch",
    "address": "...",
    "city": "...",
    "state": "IL",
    "zip": "...",
    "country": "US"
  },
  "lines": [
    {
      "identifier": "B00060043",
      "qty": 12,
      "warehouseAbbr": "IL",
      "sourceInvoiceId": "gid://printavo/Invoice/...",
      "sourceInvoiceVisualId": "1234",
      "sourceLineItemId": "gid://printavo/LineItem/..."
    }
  ],
  "poNumber": "#1234, #1235",
  "comments": "Consolidated from invoices: #1234, #1235",
  "paymentProfileId": "..."
}
```

**New required per-line fields** (FR-017):
- `sourceInvoiceId` — Printavo invoice GraphQL node ID
- `sourceInvoiceVisualId` — Printavo invoice visualId (without `#`)
- `sourceLineItemId` — Printavo line item ID

**Validation** (returns 400 on failure):
- Existing validations (shippingAddress fields, lines non-empty, identifier present, qty ≥ 1) are unchanged.
- NEW: each `line` MUST include `sourceInvoiceId`, `sourceInvoiceVisualId`, `sourceLineItemId`. Reject if any line is missing any of these.

---

## Response (success)

```json
{
  "ok": true,
  "ssOrder": { /* full response from createSSOrder, unchanged */ },
  "perInvoice": [
    {
      "sourceInvoiceId": "gid://printavo/Invoice/...",
      "sourceInvoiceVisualId": "1234",
      "classification": "fully-ordered",
      "statusUpdate": {
        "outcome": "updated",
        "reason": "fully-ordered-eligible",
        "previousStatus": { "id": "256605", "name": "Ready to Order" },
        "newStatus": { "id": "<GOODS_IN_TRANSIT_STATUS_ID>", "name": "Goods In Transit" }
      },
      "partialItemsSummary": null
    },
    {
      "sourceInvoiceId": "gid://printavo/Invoice/...",
      "sourceInvoiceVisualId": "1235",
      "classification": "partial",
      "statusUpdate": {
        "outcome": "skipped",
        "reason": "partial"
      },
      "partialItemsSummary": {
        "sourceInvoiceVisualId": "1235",
        "totalItemsStillNeeded": 6,
        "lineItems": [ /* PartialItemsLineItem[] */ ]
      }
    }
  ],
  "attributionRecord": {
    "ssOrderRef": "<orderNum or po-fallback>",
    "writeOk": true,
    "writeError": null
  }
}
```

**Per-invoice `statusUpdate.outcome` values**:
- `updated` — Printavo confirmed the status change to "Goods In Transit"
- `failed` — Printavo returned an error; client should surface a retry control pointing at `/api/printavo-status-update`
- `skipped` — either `classification !== 'fully-ordered'` OR the invoice was not in "Ready to Order" at the time of the update

**Per-invoice `statusUpdate.reason` values** (debugging / UI labeling):
- `fully-ordered-eligible` (outcome=updated)
- `partial` (outcome=skipped)
- `skipped-not-ready` (outcome=skipped, was not in Ready-to-Order)
- `printavo-error` (outcome=failed)
- `not-attempted-ss-failed` (only appears when SS itself failed — see below)

---

## Response (SS failure, FR-007)

If `createSSOrder` throws, no Printavo updates are attempted and no attribution record is written:

```json
{
  "error": "<message from createSSOrder>"
}
```

HTTP status: 500. Existing behavior, unchanged.

---

## Response (partial Printavo failure with SS success)

If SS succeeded but one or more Printavo updates failed, HTTP status is **still 200** with `ok: true`. The per-invoice `statusUpdate.outcome === 'failed'` entries carry the error for the client to surface (FR-010). The SS order success is the dominant result — the user should not see a 5xx error when the SS side actually worked.

```json
{
  "ok": true,
  "ssOrder": { /* ... */ },
  "perInvoice": [
    {
      "sourceInvoiceVisualId": "1234",
      "classification": "fully-ordered",
      "statusUpdate": {
        "outcome": "failed",
        "reason": "printavo-error",
        "errorMessage": "Printavo HTTP 502: bad gateway",
        "retryEndpoint": "/api/printavo-status-update"
      }
    }
  ],
  "attributionRecord": { "ssOrderRef": "...", "writeOk": true, "writeError": null }
}
```

---

## Response (attribution write failure with SS success)

If the attribution record write fails after SS success, HTTP status remains **200** with `ok: true` and the failure is reported in `attributionRecord` (FR-022). The user is informed that future partial-state derivation for those invoices may be unavailable. There is no auto-retry for the write inside this endpoint; manual correction is out of scope for Phase 1.

```json
{
  "ok": true,
  "ssOrder": { /* ... */ },
  "perInvoice": [ /* ... */ ],
  "attributionRecord": {
    "ssOrderRef": "<orderNum>",
    "writeOk": false,
    "writeError": "Vercel Blob 502: ..."
  }
}
```

---

## Server-side execution order (FR-021)

1. Auth + validation (existing).
2. `await createSSOrder(...)` — SS submission. On failure, return 500 with `error`.
3. `classifyInvoices(...)` — pure; computes per-invoice classification.
4. `Promise.allSettled(qualifyingInvoices.map(inv => setInvoiceStatus(inv.id, GOODS_IN_TRANSIT_STATUS_ID)))` — per-invoice updates, independent failures.
5. `writeAttributionRecord(...)` — persist to Vercel Blob.
6. Build aggregated response and return 200.

---

## Logging (Principle V)

- Existing `[place-order]` log lines remain.
- New: `[place-order] Printavo status update for invoice <visualId>: <outcome>` per qualifying invoice.
- New: `[place-order] Order attribution record written: <ssOrderRef> (writeOk=<bool>)`.

Failures (any of: SS, Printavo, attribution) MUST log the full error message and stack.
