# DR-002-02 — Allowed status transitions and exception paths

| Field | Value |
|---|---|
| **Decision ID** | `DR-002-02` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Terry's signature** |
| **Owner** | Terry (Americana) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-02 #125](https://github.com/p0wder/asp-webapp/issues/125) |
| **Epic** | [EPIC-TG-002 #75](https://github.com/p0wder/asp-webapp/issues/75) |
| **Depends on** | **`DR-002-01`** — this decision is void without the state set it operates on |
| **Blocks** | EPIC-TG-022, EPIC-TG-023, EPIC-TG-024, EPIC-TG-025 |
| **Reapproval required when** | `DR-002-01` changes, or a new actor class (a customer-facing self-service action, an automated agent) is allowed to move a state |

---

## 1. The decision

**Every state change names an actor and an event, and anything not listed
below is refused.** The transition tables are an allow-list, not a guideline.

Three properties hold across all seven dimensions:

1. **Default deny.** An unlisted transition is rejected with the reason
   "not an allowed transition", not permitted-with-a-warning.
2. **Every transition records who, when, from, to, and its evidence.** A
   transition without an actor is a defect; `System` is an actor and must be
   named as one.
3. **Refusing a transition is never a silent no-op.** It returns a machine-
   readable reason, as `setInvoiceStatus` already does for Printavo.

## 2. Why: the pattern already exists, at one-transition scale

`lib/printavo.js:220-222` holds exactly one allow-list entry:

```js
const ALLOWED_INVOICE_STATUS_TRANSITIONS = new Set([
  `${READY_TO_ORDER_STATUS_ID}->${GOODS_IN_TRANSIT_STATUS_ID}`,
]);
```

and `setInvoiceStatus` refuses anything else with a message telling the reader
to add it to the set if intended (`:246-251`). That is the right instinct, at
the smallest possible scale — one legal move, hard-coded, in the Printavo
client, guarding one path.

Everything else is unguarded. `app/api/proof-decision/route.js:53` calls
`setQuoteStatus` — the *unguarded* sibling — so a customer's proof decision can
set `ART_APPROVED` or `DESIGN_NEEDED` from **any** current status, including a
job already in production, or one already cancelled. This decision generalises
the `ALLOWED_*_TRANSITIONS` pattern to every dimension and moves it out of the
Printavo adapter into the domain (ADR-0004).

## 3. Actors

| Actor | Who | Notes |
|---|---|---|
| `Owner` | Terry | The only actor who may waive a gate (`DR-002-04`) or cancel a committed job |
| `Sales` | Staff handling quotes and customers | |
| `Art` | Staff producing artwork and proofs | |
| `Purchasing` | Staff ordering and receiving goods | |
| `Production` | Shop floor | |
| `Bookkeeper` | Financial records | May post adjustments; **may not** move Production or Fulfillment |
| `Customer` | Authenticated, or holder of a valid signed link | May only approve/decline. Never sets an internal state directly. |
| `System` | The application, acting on an external event | Stripe webhook, supplier response, expiry sweep. **Never** an unattributed change. |

## 4. Transition tables

Format: `FROM → TO` · actor · triggering event · evidence recorded.

### 4.1 Sales

| From → To | Actor | Event | Evidence |
|---|---|---|---|
| `DRAFT → QUOTED` | Sales | All lines priced | Priced line set |
| `QUOTED → SENT` | Sales | Quote sent | Message id, recipient, timestamp |
| `SENT → ACCEPTED` | Customer | Approval via portal or signed link | Approval record + link/session used |
| `SENT → DECLINED` | Customer | Decline | Decline record, optional reason |
| `SENT → EXPIRED` | System | Validity window elapsed | Expiry timestamp |
| `SENT → QUOTED` | Sales | Re-priced before response | New revision number |
| `EXPIRED → SENT` | Sales | Re-sent after refresh | New validity window |
| `DECLINED → *` | — | **None.** Terminal. | A declined quote is re-quoted as a new record |

### 4.2 Commercial

| From → To | Actor | Event | Evidence |
|---|---|---|---|
| `NOT_COMMITTED → COMMITTED` | Sales | Job created from an `ACCEPTED` quote | Quote reference + acceptance record |
| `COMMITTED → CHANGE_REQUESTED` | Sales, Customer | Change request received | Written request, requester named |
| `CHANGE_REQUESTED → COMMITTED` | Sales | Change accepted or withdrawn | New revision, or withdrawal note |
| `COMMITTED → CANCELLED` | **Owner only** | Cancellation | Reason **and** the disposition of committed cost (goods ordered, artwork done, production run) |
| `CHANGE_REQUESTED → CANCELLED` | **Owner only** | Cancellation | As above |
| `COMMITTED → CLOSED` | Bookkeeper | Delivered and settled | Fulfillment `DELIVERED` + Payment `SETTLED` |
| `CANCELLED → *` | — | **None.** Terminal. | See §5 — reopening creates a **new** job |
| `CLOSED → COMMITTED` | Owner | Post-close issue (return, dispute) | Reopen record + reason |

### 4.3 Artwork

| From → To | Actor | Event | Evidence |
|---|---|---|---|
| `NEEDED → IN_PROGRESS` | Art | Assigned | Assignee |
| `IN_PROGRESS → PROOF_SENT` | Art | Proof sent | Proof asset id + hash, send receipt |
| `PROOF_SENT → APPROVED` | Customer | Approval | Approval pinned to **that** proof asset id |
| `PROOF_SENT → CHANGES_REQUESTED` | Customer | Decline | Customer comments |
| `CHANGES_REQUESTED → IN_PROGRESS` | Art | Revision started | — |
| `APPROVED → CHANGES_REQUESTED` | Customer, Sales | Late change | Reopen reason; **triggers `DR-002-04` reopen handling** |
| `NEEDED → NOT_REQUIRED` | Art | Exact reorder, or blanks | Prior approved asset id, or a "blanks" declaration |
| `PROOF_SENT → APPROVED` where the approved asset ≠ the sent asset | — | **Refused.** | Approval binds to one asset, always |

### 4.4 Payment

Amount rules are `DR-002-05`; these are the permitted moves.

| From → To | Actor | Event | Evidence |
|---|---|---|---|
| `UNPAID → PARTIALLY_PAID` | System | Payment posted below total | Provider receipt id |
| `UNPAID / PARTIALLY_PAID → PAID_IN_FULL` | System | Balance reaches zero | Provider receipt id |
| `* → OVERPAID` | System | Postings exceed total | Provider receipt id |
| `PAID_IN_FULL / OVERPAID → REFUND_PENDING` | **Owner** | Refund authorised | Amount + reason |
| `REFUND_PENDING → REFUNDED` | System | Provider confirms | Provider refund id |
| `* → DISPUTED` | System | Provider dispute notification | Provider dispute id |
| `DISPUTED → PAID_IN_FULL` | System | Dispute won | Provider resolution |
| `DISPUTED → REFUNDED` | System | Dispute lost | Provider resolution |
| `PAID_IN_FULL → SETTLED` | Bookkeeper | Job delivered, no open dispute | — |
| Any manual posting | Bookkeeper | Cash, check, adjustment | **Written evidence required** — see illegal move #3 |

### 4.5 Procurement

| From → To | Actor | Event | Evidence |
|---|---|---|---|
| `TO_ORDER → ORDERED` | Purchasing, System | Supplier accepted the order | PO number + supplier confirmation |
| `TO_ORDER → UNKNOWN` | System | Supplier call timed out or returned unparseable | Request id, elapsed time, raw outcome |
| `UNKNOWN → ORDERED` | **Purchasing (human only)** | Reconciled — the order exists at the supplier | Supplier lookup result (e.g. `getSSOrdersByPO`) |
| `UNKNOWN → TO_ORDER` | **Purchasing (human only)** | Reconciled — no order exists | Supplier lookup result showing absence |
| `ORDERED → PARTIALLY_RECEIVED` | Purchasing | Goods counted in, short of ordered | Receipt record with counted quantity |
| `ORDERED / PARTIALLY_RECEIVED → RECEIVED` | Purchasing | Full quantity counted in | Receipts summing to ordered qty |
| `ORDERED / PARTIALLY_RECEIVED → SHORTAGE` | Purchasing, System | Supplier backorder or cancellation | Supplier notice |
| `SHORTAGE → ORDERED` | Purchasing | Re-ordered or substituted | New PO, or an approved substitution |
| `TO_ORDER → NOT_REQUIRED` | Purchasing | Customer-supplied, or filled from stock | CSG receipt, or stock allocation |
| `UNKNOWN → * ` by `System` | — | **Refused.** | See illegal move #1 |

### 4.6 Production

| From → To | Actor | Event | Evidence |
|---|---|---|---|
| `NOT_READY → READY` | System | All required gates cleared or waived | Gate evaluation result + per-gate evidence |
| `READY → NOT_READY` | System | A gate reopened (`DR-002-04`) | Which gate, and why |
| `READY → SCHEDULED` | Production | Placed on the calendar | Date + machine assignment |
| `SCHEDULED → IN_PRODUCTION` | Production | Work started | Start record |
| `SCHEDULED → OUTSOURCED` | Purchasing | Sent to a contract decorator | Vendor, quantity out, due date, outbound record |
| `OUTSOURCED → PRODUCED` | Purchasing | Goods returned and counted | Counted quantity + reject count |
| `IN_PRODUCTION → PRODUCED` | Production | Run complete | Completed quantity + reject count |
| `IN_PRODUCTION / OUTSOURCED / SCHEDULED → HOLD` | Production, Owner | Stopped | Reason |
| `HOLD → SCHEDULED` | Production | Released | Release note |
| `HOLD → IN_PRODUCTION` | Production | Released mid-run | Release note |
| `PRODUCED → IN_PRODUCTION` | Production | Rework of the same job | Rework reason + quantity |
| `NOT_READY → SCHEDULED` or `→ IN_PRODUCTION` | — | **Refused.** | See illegal move #2 |

### 4.7 Fulfillment

| From → To | Actor | Event | Evidence |
|---|---|---|---|
| `NOT_READY → READY_FOR_PICKUP` | Production | Packed, customer notified | Notification receipt |
| `NOT_READY → SHIPPED` | Production | Handed to carrier | Carrier + tracking number |
| `READY_FOR_PICKUP → DELIVERED` | Production | Collected | Who collected, when |
| `SHIPPED → DELIVERED` | System | Carrier confirmation | Carrier event |
| `NOT_READY → PARTIALLY_FULFILLED` | Production | Part delivered | Quantity + which lines |
| `PARTIALLY_FULFILLED → DELIVERED` | Production, System | Remainder delivered | Quantity + confirmation |
| `SHIPPED / DELIVERED → RETURNED` | Owner | Refused, undeliverable, or rejected | Reason + condition on return |
| `RETURNED → SHIPPED` | Production | Re-sent | New tracking |
| `SHIPPED → READY_FOR_PICKUP` | — | **Refused.** | See illegal move #4 |

## 5. Cancellation and reopening

**Cancellation is terminal. Reopening creates a new job.**

- Commercial `CANCELLED` has **no outbound transition**. There is no
  "un-cancel". If a customer changes their mind, Sales creates a new job that
  references the cancelled one. This is deliberate: an un-cancel would leave a
  job whose audit trail says it was cancelled and whose goods were disposed
  of, with no record of which decision is current.
- Cancelling requires **the disposition of committed cost** in the evidence:
  garments already ordered, artwork already produced, a production run already
  made. A cancellation record that does not account for them is refused.
- Cancelling does **not** cancel supplier orders. Procurement stays at
  `ORDERED` or `RECEIVED`; the goods exist and must be dispositioned. **A
  cancelled job with `ORDERED` goods is an expected combination, not a data
  error.**
- **Reopening a *gate*** is different from reopening a job, is routine, and is
  governed by `DR-002-04`. Gate reopens drive Production `READY → NOT_READY`.
- **Reopening a `CLOSED` job** (a return or a late dispute) is Owner-only and
  moves Commercial back to `COMMITTED`. This is the one backward transition
  across a terminal-looking state, and it exists because money can move after
  delivery.

## 6. Outsourced work

- `OUTSOURCED` is a Production state, but its transitions are owned by
  **Purchasing** — it is a supplier relationship wearing a production hat.
- Goods leaving the building require an outbound record (vendor, quantity,
  due date). Goods returning require a **count**, exactly like receiving from
  S&S. A contract decorator that returns 46 of 48 shirts is a shortage, and
  it reopens the goods gate (`DR-002-04`).
- The customer sees "In production" throughout. Whether Americana decorated it
  in house is not a customer-facing distinction.

## 7. Fulfillment exceptions

| Exception | Handling |
|---|---|
| **Partial shipment** | `PARTIALLY_FULFILLED`, tracked per line. Commercial does **not** reach `CLOSED` until the remainder is delivered or credited. |
| **Customer never collects** | Stays `READY_FOR_PICKUP`. Reminder cadence per `DR-002-11`. **No automatic disposal or restocking** — that is an Owner decision with no default. |
| **Carrier loses the shipment** | `SHIPPED → RETURNED` with reason "lost in transit", then re-produce (a new job, since goods were consumed) or refund. |
| **Damaged on arrival** | `RETURNED`, condition recorded. Refund or re-produce is an Owner decision. |
| **Wrong goods delivered** | `RETURNED`. If Americana's error, re-produce at cost; if the supplier's, a supplier claim. Both need Owner sign-off. |

## 8. Named illegal moves

AC1 requires at least three. Eight, with the failure each prevents:

| # | Illegal move | Why it is refused | What it would cause |
|---|---|---|---|
| **1** | Procurement `UNKNOWN → ORDERED` **by `System`** | Only a human who has checked the supplier may resolve an `UNKNOWN` | Automatic resolution either invents an order that does not exist, or triggers a retry that places a **second real S&S order** — baseline finding **F2**, the exact failure TG-001-03 exists to prevent |
| **2** | Production `NOT_READY → IN_PRODUCTION` | Bypasses every gate in `DR-002-03` | Printing on garments that are not paid for, not approved, or not in the building. The waiver path (`DR-002-04`) exists precisely so this shortcut is never needed |
| **3** | Payment `UNPAID → PAID_IN_FULL` with no provider receipt or written evidence | Payment state is derived from postings, never asserted | A job clears the paid gate and ships with no money received and no record of who claimed otherwise |
| **4** | Fulfillment `SHIPPED → READY_FOR_PICKUP` | Goods cannot be both with a carrier and on the shelf | Two staff pick the same order; the second finds an empty shelf and re-produces it |
| **5** | Commercial `CANCELLED → COMMITTED` | Cancellation is terminal (§5) | A job whose history says "cancelled, goods returned to stock" quietly becomes live again against goods that are gone |
| **6** | Sales `DECLINED → ACCEPTED` | A declined quote is re-quoted, not revived | Committing Americana on stale pricing the customer already rejected — pricing that may predate a supplier cost change |
| **7** | Artwork `CHANGES_REQUESTED → APPROVED` without a new proof | Approval binds to a specific proof asset (§4.3) | Producing the artwork the customer **rejected**, with an approval record that appears to authorise it. This is the liability case. |
| **8** | Any Production or Fulfillment transition while Commercial is `CANCELLED` | A cancelled job is not worked | Labour and goods spent on an order nobody will pay for |

Additional standing rule: **`Customer` may never be the actor on a Commercial,
Procurement, Production or Fulfillment transition.** A customer's action can
*cause* one (approving a proof clears the art gate, which may make a job
`READY`), but the actor on that derived transition is `System`, attributed to
the customer's action.

## 9. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Allow any transition, warn on unusual ones** | A warning nobody reads is a permission. Illegal moves 1, 2 and 7 all have real financial or legal cost. |
| **Role-based only ("Owner can do anything")** | Loses the *event* and the *evidence*. "Terry set it to Paid" is not an audit trail; "Terry posted a $400 check, ref 1182" is. |
| **Encode transitions in the database as a table** | Attractive, but it makes the rules editable without review, and ADR-0005's reasoning applies: a rule that can be changed without a diff is a rule with no history. Keep them in code, in `lib/domain/`, unit-tested — the `ALLOWED_INVOICE_STATUS_TRANSITIONS` pattern, generalised. |
| **Let a customer's proof decision set state directly (status quo)** | `proof-decision/route.js:53` does this today via the unguarded `setQuoteStatus`, from *any* current status. It is illegal move #7 and #8 waiting to happen. |
| **Soft-delete instead of `CANCELLED`** | Hides the record from every report that should show it, including the one that answers "what did we spend on jobs that never shipped?" |

## 10. Migration and rollback impact

- **Forward:** enforcement starts at the domain boundary (ADR-0004) and applies
  only to transitions the new system performs. Imported historical Printavo
  records are **not** validated against these tables — history contains moves
  this policy forbids, and rejecting it would block the import.
- **Backfilled history is marked as such** and is exempt. New transitions on an
  imported record are validated normally.
- **Rollback:** the allow-list is code. Reverting restores the previous
  behaviour with no data change. Transitions already recorded stay valid —
  they are an append-only log, not a derived view.
- **Do not remove `ALLOWED_INVOICE_STATUS_TRANSITIONS` from `lib/printavo.js`**
  while dual-run writes to Printavo. It guards the external write; this
  decision guards the internal one. Both are needed.

## 11. Open questions for the owner

| # | Question | Safe default until answered |
|---|---|---|
| **Q1** | Is Owner-only cancellation of a committed job workable, or does Sales need it? Terry is the only cancellation authority as written. | Owner-only. Widening later is easy. |
| **Q2** | Should a `CANCELLED` job's goods auto-return to stock, or wait for a human? | Wait for a human. Auto-restocking goods that were never physically returned corrupts inventory silently. |
| **Q3** | Is "reopening a closed job creates a new job" (§5) how Americana handles a return today, or does Terry expect the original job to reopen? | As written: Commercial `CLOSED → COMMITTED` for the money, a **new** job for any re-production. |
| **Q4** | Does the bookkeeper need to move Payment states directly, or only post transactions and let state derive? | Post transactions; state derives. Route with `DR-002-05`. |
| **Q5** | Is there a real case for a customer cancelling their own order without staff involvement? | No. `Customer` has no cancellation transition. |

## 12. Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Business owner | Terry | ☐ Accepted ☐ Rejected ☐ Amended | | |
| Architecture | Scott | ☐ Reviewed | | |

Blocked behind `DR-002-01`. Until **both** are signed, no agent may implement a
transition rule.
