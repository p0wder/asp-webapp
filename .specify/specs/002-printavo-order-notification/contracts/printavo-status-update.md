# Contract: `POST /api/printavo-status-update` (new)

**Route file**: `app/api/printavo-status-update/route.js`

**Auth**: Both layers required per Principle VII:
- Matcher entry in `proxy.js` `config.matcher` (admin-gated edge auth)
- `getServerSession(authOptions)` at top of handler (returns 401 if missing)

**Purpose**: Idempotent retry endpoint for failed Printavo status updates (FR-010). Allows the confirmation screen to surface a per-invoice retry control that does NOT re-submit the SS Activewear order.

---

## Request

```json
{
  "invoiceId": "gid://printavo/Invoice/...",
  "targetStatusId": "<GOODS_IN_TRANSIT_STATUS_ID>"
}
```

**Validation** (returns 400 on failure):
- `invoiceId` is required and MUST be a non-empty string.
- `targetStatusId` is required and MUST be present in the in-code allow-list. For Phase 1, the only allowed value is `GOODS_IN_TRANSIT_STATUS_ID`. Any other value returns 400 with `{ "error": "targetStatusId not in allow-list" }`.

---

## Response (success)

```json
{
  "ok": true,
  "skipped": false,
  "previousStatus": { "id": "256605", "name": "Ready to Order" },
  "newStatus": { "id": "<GOODS_IN_TRANSIT_STATUS_ID>", "name": "Goods In Transit" }
}
```

---

## Response (idempotent skip — already in or past target)

```json
{
  "ok": true,
  "skipped": true,
  "reason": "already-in-or-past-target",
  "currentStatus": { "id": "<current>", "name": "..." }
}
```

This branch covers two cases (both safe):
1. The invoice is already in "Goods In Transit" (a prior retry succeeded).
2. The invoice has been moved further along by an admin in Printavo (e.g., "Production").

Both are treated as success — the retry is a no-op and the response indicates so.

---

## Response (failure)

```json
{
  "error": "<message from setInvoiceStatus>"
}
```

HTTP status: 500.

---

## Server-side execution order (FR-010 idempotency)

1. Auth + validation.
2. Fetch the invoice's current status from Printavo (single query).
3. If current status `=== targetStatusId` OR current status `!== READY_TO_ORDER_STATUS_ID`, return the idempotent skip response (200).
4. Else call `setInvoiceStatus(invoiceId, targetStatusId)` and return success.

---

## Logging (Principle V)

- `[printavo-status-update] retry requested for invoice <invoiceId> target <targetStatusId>`
- `[printavo-status-update] outcome: <updated|skipped|failed>`
- Errors log the full Printavo error message.
