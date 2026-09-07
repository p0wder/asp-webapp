# ADR-0005 — Transaction boundary and outbox

| Field | Value |
|---|---|
| **ADR ID** | `ADR-0005` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Scott's signature** |
| **Owner** | Scott (architecture) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-13 #136](https://github.com/p0wder/asp-webapp/issues/136) |
| **Depends on** | ADR-0001, ADR-0004 |
| **Blocks** | TG-001-03, TG-001-05, TG-004-03, EPIC-TG-006 |
| **Reapproval required when** | A side effect appears that cannot be made idempotent, or delivery ordering becomes a requirement |

---

## Context

This is the ADR the EPIC-TG-001 findings are asking for. Three of them are the
same defect wearing different clothes:

- **F2** — `/api/place-order` writes no durable record *before* calling S&S.
  A retry, a double-click or a client timeout places **a second real order**,
  and a request that times out leaves no evidence that an order may exist.
  (`app/api/place-order/route.js:79`, `lib/placeOrderChain.js`)
- **F4** — `/api/stripe-webhook` has no receipt table and no deduplication.
  Stripe delivers at least once, so a redelivered `checkout.session.completed`
  records the payment on the Printavo invoice **twice**. Worse, a failed
  Printavo write returns HTTP 200 with the comment *"Non-fatal: log but still
  return 200 so Stripe doesn't retry"* — a collected payment is silently not
  recorded, and the 200 suppresses the retry that would have fixed it.
- **V1** — there is no store in which either could be fixed.

The common cause: **an external side effect and its local record are not
protected by anything.** Either can happen without the other.

## Decision

**A local transaction never contains an external call. Intent is written and
committed first; the effect is dispatched after commit, keyed so that
repeating it is harmless.**

## The contract agents must follow

### The four steps

Every path that commits a real-world side effect — a supplier order, a card
charge, a production email, a Printavo mutation — follows this shape:

1. **Compute an idempotency key** from the business intent, *before* the
   transaction. It is derived from stable inputs (order id, line set, a
   version counter), never from a timestamp or a random value, so the same
   intent recomputes the same key. `crypto.randomUUID()` here is a defect.
2. **Open one transaction. Write the intent row** (`vendor_operation`,
   `outbox_message`) with status `PENDING` and a `UNIQUE` constraint on the
   idempotency key. **Commit.** A unique-violation here means "this intent
   already exists" — return the existing record; do not call the supplier.
3. **Dispatch after commit.** Call the supplier. Record the outcome —
   `SUCCEEDED`, `FAILED`, or **`UNKNOWN`** — in a second, separate
   transaction.
4. **`UNKNOWN` is a first-class outcome, not an error.** A timeout, a socket
   reset, or a non-JSON response means *the order may exist at the supplier*.
   It must never be retried automatically, must block further attempts on that
   key, and must surface for human reconciliation (EPIC-TG-006).

### Rules

5. **One unit of work per request** (TG-004-03). A service either receives an
   open transaction or opens exactly one. Nested `BEGIN` is a defect.
6. **Inbound webhooks are receipts, not commands.** Persist the raw event with
   its provider event ID under a `UNIQUE` constraint *before* applying any
   effect. A duplicate delivery hits the constraint and returns 200 having
   done nothing.
7. **Only acknowledge what you have durably stored.** A webhook returns 2xx
   once the receipt is committed; if applying the effect then fails, the
   receipt stays `PENDING` and a retry worker owns it. The current
   "log and return 200" pattern is precisely inverted and must go.
8. **Effects are at-least-once, so every handler must be idempotent.**
   Exactly-once delivery is not available and must not be assumed.
9. **The kill switch is evaluated before the intent row is written**, so a
   closed switch produces neither a supplier call nor a pending outbox row.
   `createSSOrder` already does this (`assertSSOrderingEnabled()` as the first
   statement); keep that ordering.
10. **Evidence is append-only.** A failed attempt's rows are never deleted —
    that is the epic's rollback requirement and the only way an `UNKNOWN`
    can ever be reconciled.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Two-phase commit / XA across Postgres and the supplier** | Neither Printavo, S&S, nor Stripe offers a prepare phase. Not available. |
| **Call the supplier inside the transaction** | Holds a database transaction open across a network call of unbounded latency, and a rollback cannot un-place the order. Strictly worse than the outbox in both directions. |
| **Rely on Stripe's / S&S's own idempotency keys** | Stripe supports them; S&S and Printavo make no such guarantee. A rule that only holds for one of three suppliers is not a rule. It remains worth *also* sending Stripe an idempotency key. |
| **A message broker (SQS, QStash, Inngest)** | The outbox table is the durable record either way; a broker is a delivery optimisation on top. Adding an operational dependency before the table exists inverts the order of work. Revisit when volume justifies it. |
| **Optimistic "retry on failure" without an intent record** | This is the status quo in `place-order`, and it is exactly how a duplicate real order gets placed. |

## Migration and rollback impact

- **Forward:** additive tables (`vendor_operation`, `outbox_message`,
  `webhook_receipt`) plus a reordering inside two handlers. No existing data
  is rewritten.
- **Rollback:** the intent row is written before the effect, so rolling the
  code back leaves a complete record of everything attempted. Rollback of the
  *table* is not safe once any row is `UNKNOWN` — those rows are the only
  evidence a supplier order may exist. Rolling back the schema therefore
  requires reconciling every `UNKNOWN` first.
- **This ADR reduces blast radius rather than adding it:** without it, the
  rollback story for a duplicated live S&S order is a phone call.

## Open questions for the owner

1. **Q1** — What dispatches the outbox after commit? Options: inline in the
   same request (simplest, dies with the function), a Vercel Cron sweep (a
   `/api/cron/refresh-leads` pattern already exists), or a queue.
   Recommendation: inline dispatch *plus* a cron sweep for anything left
   `PENDING` — the sweep is what makes it durable, and it reuses a pattern the
   repository already has.
2. **Q2** — Retry budget and backoff for `FAILED` (not `UNKNOWN`) operations,
   and after how many attempts a human is alerted. Recommendation: 5 attempts,
   exponential to ~1 hour, then alert the Owner.
3. **Q3** — Who reconciles `UNKNOWN` S&S operations, and against what? S&S
   exposes order lookup by PO number (`getSSOrdersByPO`), which is the natural
   probe. Confirm that is authoritative enough to close an `UNKNOWN`.

## Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Architecture owner | Scott | ☐ Accepted ☐ Rejected ☐ Amended | | |
