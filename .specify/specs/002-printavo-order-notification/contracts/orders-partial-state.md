# Contract: `POST /api/orders-partial-state` (new)

**Route file**: `app/api/orders-partial-state/route.js`

**Auth**: Both layers required per Principle VII:
- Matcher entry in `proxy.js` `config.matcher`
- `getServerSession(authOptions)` at top of handler (returns 401 if missing)

**Purpose**: For each `Ready to Order` invoice on the orders page, compute the per-line-item partial-state shortfall by reading local Order Attribution Records and corroborating with SS Activewear order history (FR-013, FR-014, FR-019).

**Method**: POST (despite being read-only) so the request body can carry the full invoice payload and avoid re-fetching invoices on the server. The orders page already has the invoices loaded client-side.

---

## Request

```json
{
  "invoices": [
    {
      "sourceInvoiceId": "gid://printavo/Invoice/...",
      "sourceInvoiceVisualId": "1234",
      "lineItems": [
        {
          "sourceLineItemId": "gid://printavo/LineItem/...",
          "sku": "B00060043",
          "description": "Gildan G500 — Black — L",
          "invoiceQty": 12,
          "source": "ss-activewear"
        }
      ]
    }
  ]
}
```

**Validation** (returns 400 on failure):
- `invoices` MUST be a non-empty array.
- Each invoice MUST have `sourceInvoiceVisualId` (non-empty) and at least one line item.
- Each line item MUST have `sourceLineItemId`, `sku`, `invoiceQty` (number ≥ 0), and `source` (one of `'ss-activewear' | 'sanmar' | 'unresolved-lookup'`).

---

## Response

```json
{
  "ok": true,
  "results": [
    {
      "sourceInvoiceVisualId": "1234",
      "state": "partial",
      "partialItemsSummary": {
        "sourceInvoiceVisualId": "1234",
        "totalItemsStillNeeded": 6,
        "lineItems": [
          {
            "sourceLineItemId": "gid://printavo/LineItem/...",
            "sku": "B00060043",
            "description": "Gildan G500 — Black — L",
            "invoiceQty": 12,
            "alreadyOrdered": 6,
            "stillNeeded": 6,
            "source": "ss-activewear"
          }
        ]
      }
    },
    {
      "sourceInvoiceVisualId": "1235",
      "state": "fully-covered",
      "partialItemsSummary": null
    },
    {
      "sourceInvoiceVisualId": "1236",
      "state": "no-coverage",
      "partialItemsSummary": null
    },
    {
      "sourceInvoiceVisualId": "1237",
      "state": "unavailable",
      "partialItemsSummary": null,
      "unavailableReason": "ss-history-lookup-failed",
      "unavailableMessage": "SS Activewear HTTP 502"
    }
  ]
}
```

**Per-invoice `state` values**:
- `partial` — at least one line item has `stillNeeded > 0`; the orders page renders a partial badge with the drill-down (FR-013/FR-014).
- `fully-covered` — every line item has `alreadyOrdered >= invoiceQty`; no badge rendered (but the invoice is still in "Ready to Order" status because a status update may have failed or hasn't been attempted yet — the orders page may surface this differently).
- `no-coverage` — no Order Attribution Records exist for this invoice; the invoice has never been touched by an SS Activewear submission. No badge rendered (FR-013 edge case).
- `unavailable` — derivation could not complete for this invoice. The orders page renders "Partial status unavailable — Retry" (FR-015, FR-020).

**`unavailableReason` values** (only present when `state === 'unavailable'`):
- `ss-history-lookup-failed` — SS Activewear `GET /v2/orders/` failed or timed out.
- `attribution-record-missing` — Index references an `orderRef` but the corresponding record blob is missing or corrupt (FR-020).
- `attribution-record-corrupt` — Record blob parsed but failed schema validation.

---

## Server-side execution order (FR-019 join logic)

For each invoice in the request, performed in parallel via `Promise.allSettled`:

1. `await listRecordsForInvoice(visualId)` — read the per-invoice index blob → list of `orderRef`s.
2. If no `orderRef`s → return `state: 'no-coverage'`.
3. For each `orderRef`, `await readRecord(orderRef)`:
   - If any record is missing or corrupt → return `state: 'unavailable'` with appropriate reason. (Do NOT silently exclude — per FR-020.)
4. Sum per-`sourceLineItemId` `qty` across all returned records.
5. (Mandatory corroboration — failure yields `state: 'unavailable'` per FR-019) `await getSSOrdersByPO(visualId)`:
   - On failure → return `state: 'unavailable'` with `ss-history-lookup-failed`.
   - On success → ensure each `orderRef` we read locally is also present in the SS response. If an `orderRef` is missing from SS (e.g., canceled in SS UI), exclude its contribution from the sum.
6. Build `PartialItemsSummary`:
   - For each line item in the request, compute `alreadyOrdered = sum of contributions for sourceLineItemId across attribution records`, `stillNeeded = max(invoiceQty - alreadyOrdered, 0)`.
   - For Sanmar line items, `alreadyOrdered = 0` and `stillNeeded = invoiceQty` (the SS Activewear pipeline doesn't cover them); included in summary with `source: 'sanmar'`.
7. If `totalItemsStillNeeded > 0` → `state: 'partial'`. Else `state: 'fully-covered'`.

---

## Rate-limit considerations (SS docs: 60 req/min)

This endpoint may fire one SS `GET /v2/orders/` call per invoice in the request. If the orders page is rendering 20 invoices, that's 20 calls back-to-back. For Phase 1's small-scale operation (<10 visible invoices typically), this stays under budget. If rate-limit headers indicate pressure (`X-Rate-Limit-Remaining < 10`), the server SHOULD skip SS corroboration for the remaining invoices and rely on the local attribution records alone — those invoices return `state: 'partial' | 'fully-covered' | 'no-coverage'` based on local data only and add a soft warning field `corroborationSkipped: true` to the response (not blocking, but observable for logging).

Optional optimization (not required for Phase 1): batch the SS calls by grouping multiple visualIds into a single comma-separated `GET /v2/orders/{vid1,vid2,...}` request — the SS endpoint accepts comma-separated identifiers per its docs.

---

## Logging (Principle V — read-only, so log on error only)

- `[orders-partial-state] derivation failed for invoice <visualId>: <reason>` per failing invoice.
- `[orders-partial-state] SS rate-limit pressure: X-Rate-Limit-Remaining=<n>` when `< 10`.
- No per-invoice success log (would flood logs on every orders-page load).
