# ADR-0003 — Money and time representation

| Field | Value |
|---|---|
| **ADR ID** | `ADR-0003` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Scott's signature** |
| **Owner** | Scott (architecture) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-13 #136](https://github.com/p0wder/asp-webapp/issues/136) |
| **Depends on** | ADR-0001 |
| **Related** | `DR-002-05` (payment policy), `DR-002-07` (tax) — both consume the rounding rule fixed here |
| **Blocks** | TG-003-04, EPIC-TG-016 (pricing engine), EPIC-TG-031 (payment ledger) |
| **Reapproval required when** | A second currency is introduced, or a tax authority requires a rounding rule different from the one below |

---

## Context

**Money is currently floating point.** `app/quote/page.jsx:210` computes

```js
const salesTax = discountedSubtotal * 0.075;
```

in the browser, on a float, and `lib/pricing.js` holds the screen-print matrix
as decimal literals (`7.57`, `8.17`, …). Stripe is the only place that already
speaks integer minor units — `amountCents` in
`app/api/create-payment-session/route.js:13`. So the system has two money
representations and converts between them at the least-tested boundary: the
one that charges a card.

**Time has no policy at all.** There is no timezone declaration anywhere in
the repository, and the customer-facing order status page formats dates with
`toLocaleDateString('en-US', …)` (`app/order-status/page.jsx:45`) — which
renders in *the viewer's* timezone, so a customer in another zone can see a
different date than the shop does for the same order.

## Decision

**Money is an integer count of minor units. Time is `timestamptz` stored in
UTC and displayed in `America/Chicago`.**

## The contract agents must follow

### Money

1. **Storage:** `bigint` minor units (cents) plus a `char(3)` ISO-4217
   currency column. Never `float`, `real`, `double precision`, or `money`.
   `numeric` is permitted only for *rates* (a tax rate, a markup percentage),
   never for an amount.
2. **In JavaScript, money is a `Number` of cents** and every arithmetic
   result passes through `Math.round` before it is stored or compared.
   Cents are well within `Number.MAX_SAFE_INTEGER` for this business;
   `BigInt` is not needed and would complicate JSON.
3. **One rounding point per document.** Multiply and discount at full
   precision, round **once** when a line total is persisted, and sum rounded
   line totals to get the document total. Never round twice, and never
   re-derive a stored total by recomputing it from inputs.
4. **Rounding is half-up on the absolute value** (so −0.005 → −0.01), applied
   at the line level. `DR-002-07` may override this for tax specifically; if
   it does, that decision wins and this ADR is amended, not ignored.
5. **A displayed amount is formatted from the stored integer.** No component
   does money arithmetic. The float math at `app/quote/page.jsx:210` is the
   pattern being retired.
6. **Currency is USD and is still stored explicitly.** A single-currency
   business that omits the column pays for it later.

### Time

7. **Storage:** `timestamptz` for instants, always written as UTC. Never
   `timestamp` (without zone) for an instant.
8. **`date` for business days** — due date, ship date, an exemption
   certificate's expiry. A due date is a calendar day, not an instant, and
   forcing it into a timestamp invents a meaningless midnight.
9. **The business timezone is `America/Chicago`** (South Sioux City, NE).
   Every server-side render of a date, every report boundary and every
   "today" comparison resolves in that zone.
10. **Client-side formatting must pass the timezone explicitly.** The bare
    `toLocaleDateString('en-US', …)` calls are defects under this rule.
11. **`created_at` / `updated_at` are set by the database** (`now()`), not by
    the application, so clock skew between serverless instances cannot reorder
    two rows written a millisecond apart.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **`numeric(12,2)` for amounts** | Correct arithmetic, but every read into JavaScript becomes a string that some caller will eventually `parseFloat`. Integer cents make the wrong thing hard rather than merely discouraged. |
| **Floating point (status quo)** | `0.1 + 0.2 !== 0.3`. On a $4,180 order a repeated float rounding error is small but it is *visible* on an invoice, and it is unarguable to a customer or the bookkeeper. |
| **A money value object / library (dinero.js, big.js)** | YAGNI per the constitution. Single currency, integer cents, `Math.round` — the library earns its place only if multi-currency arrives. |
| **Storing local time** | Ambiguous one hour a year at the DST fall-back, and unorderable across the change. `timestamptz` has no such hole. |
| **UTC everywhere including display** | Correct storage, wrong presentation: a 7pm Central ship date renders as the next calendar day, which is the exact kind of off-by-one a shop notices in production. |

## Migration and rollback impact

- **Forward:** the schema starts correct; there is no legacy money column to
  convert. The conversion work is at the *import* boundary (EPIC-TG-009),
  where Printavo decimal amounts become cents — that conversion rounds once,
  half-up, and records the source value in the provenance payload so it is
  auditable.
- **Rollback:** representation is internal. Rolling back a feature that stores
  money does not require reconverting anything.
- **The irreversible moment** is the first invoice document a customer
  receives with a rounded total on it. A later change to the rounding rule
  will not match documents already sent. `DR-002-07` must therefore be signed
  before the first live invoice, or the tax line must be non-binding until it
  is.

## Open questions for the owner

1. **Q1** — Confirm `America/Chicago`. Dakota County, NE observes Central
   Time, but Americana may quote or ship to customers who expect otherwise;
   this decision fixes the *shop's* zone, not the customer's.
2. **Q2** — Rounding at the line versus at the invoice total changes cents on
   multi-line orders. Recommendation is line-level; the bookkeeper may have a
   filing-driven preference, which is why `DR-002-07` can override.

## Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Architecture owner | Scott | ☐ Accepted ☐ Rejected ☐ Amended | | |
| Consulted on rounding | Bookkeeper (via `DR-002-07`) | ☐ Confirmed | | |
