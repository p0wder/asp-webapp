# DR-002-01 — Americana production statuses

| Field | Value |
|---|---|
| **Decision ID** | `DR-002-01` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Terry's signature** |
| **Owner** | Terry (Americana) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-01 #124](https://github.com/p0wder/asp-webapp/issues/124) |
| **Epic** | [EPIC-TG-002 #75](https://github.com/p0wder/asp-webapp/issues/75) |
| **Depends on** | TG-001-01 (closed) |
| **Blocks** | `DR-002-02`, `DR-002-03`, `DR-002-04`, EPIC-TG-022, EPIC-TG-023, EPIC-TG-024 |
| **Reapproval required when** | A state is added or removed, a decoration method with a different workflow is offered, or outsourced decoration becomes routine |

---

## 1. The decision

**Americana tracks seven independent state dimensions per job, not one status
field.** A job has a Sales state *and* an Artwork state *and* a Payment state,
concurrently. There is no single "status" column.

## 2. Why: what the code does today

Printavo exposes exactly one status per record, and the application maps 21
distinct Printavo status names onto a 6-step customer timeline in
`app/order-status/page.jsx:17-31`:

> `quote` · `design needed` · `urgent follow up on quote` ·
> `quote follow up complete` · `quote approval sent` · `quote approved` ·
> `incomplete action needed` · `order on hold` · `art approval sent` ·
> `art approved` · `ready to order` · `goods in transit` ·
> `ready for production` · `in production` · `embroidery in production` ·
> `completed` · `order ready for pickup` · `order shipped` · `complete` ·
> `feedback request` · `need it again`

Five have hard-coded IDs: `256246` Quote (`app/api/submit-quote/route.js:28`),
`256605` Ready to Order, `292756` Goods In Transit, `256250` Art Approved,
`433068` Design Needed (`lib/printavo.js:212-215`).

**That single field is already overloaded, and the code shows the strain.**
Three examples from the repository:

- **"Ready to Order" is a procurement state that has swallowed a payment
  claim.** `lib/orderClassification.js:117` refuses to touch any invoice not
  in `READY_TO_ORDER`, and `lib/placeOrderChain.js:82` moves it to
  `GOODS_IN_TRANSIT`. So "have the garments been purchased?" and "is this job
  cleared to spend money?" are the same field.
- **"Art Approved" and "Design Needed" are set by the *customer's* proof
  decision** (`app/api/proof-decision/route.js:51`) — a customer action
  overwrites a field that production also reads.
- **`resolveStep` falls through to step 0** for any unrecognised status
  (`app/order-status/page.jsx:39`), so an unmapped Printavo status silently
  tells a customer their finished order is a fresh quote.

A single status also cannot express the ordinary case: artwork approved,
garments not yet in, half paid. Under one field, something has to be lost.

## 3. The seven dimensions

Roles referenced below: **Owner** (Terry), **Sales**, **Art**,
**Purchasing**, **Production**, **Bookkeeper**, **Customer**, **System**.

"Visible label" is what a **customer** sees; `—` means the state is internal
and is not surfaced to customers at all.

### 3.1 Sales

| State | Definition | Entry evidence | Exit evidence | Visible label | Responsible |
|---|---|---|---|---|---|
| `DRAFT` | Being built by staff or the web form; not sent | Quote record created | Quote sent | — | Sales |
| `QUOTED` | Priced and internally complete, not yet sent | All line items priced | Sent to customer | — | Sales |
| `SENT` | Delivered to the customer, awaiting response | Send receipt (message id, timestamp) | Customer response or expiry | "Quote sent" | Sales |
| `ACCEPTED` | Customer has approved the quote | Customer approval record: who, when, from which link | Job created | "Quote approved" | Customer |
| `DECLINED` | Customer declined | Customer decline record, optional reason | Terminal | "Quote declined" | Customer |
| `EXPIRED` | Validity window elapsed without a response | Expiry date reached, no response | Terminal (re-quote makes a new record) | "Quote expired" | System |

### 3.2 Commercial

Whether Americana is contractually committed.

| State | Definition | Entry evidence | Exit evidence | Visible label | Responsible |
|---|---|---|---|---|---|
| `NOT_COMMITTED` | A quote exists; no obligation on either side | Default | Sales `ACCEPTED` | — | Sales |
| `COMMITTED` | A job exists; Americana is obligated to deliver | Sales `ACCEPTED` + job created | Closed or cancelled | "Order confirmed" | Sales |
| `CHANGE_REQUESTED` | A change is pending that may alter price, quantity or spec | Written change request with the requester named | Change accepted (new revision) or rejected | "Change under review" | Sales |
| `CANCELLED` | Terminated before delivery | Cancellation record: who, when, reason, and the disposition of committed cost | **Terminal** | "Order cancelled" | Owner |
| `CLOSED` | Delivered and financially settled | Fulfillment complete **and** Payment `SETTLED` | Terminal | "Complete" | Bookkeeper |

### 3.3 Artwork

| State | Definition | Entry evidence | Exit evidence | Visible label | Responsible |
|---|---|---|---|---|---|
| `NOT_REQUIRED` | No new artwork (exact reorder, blanks) | Reference to the prior approved artwork, or "blanks" on the job | Terminal for this job | — | Art |
| `NEEDED` | Artwork required, not started | Job committed with a decoration line | Work started | "Artwork in progress" | Art |
| `IN_PROGRESS` | Being produced or adapted | Assigned to an artist | Proof produced | "Artwork in progress" | Art |
| `PROOF_SENT` | Proof delivered to the customer for approval | Proof asset + send receipt | Customer decision | "Proof ready for your approval" | Art |
| `APPROVED` | Customer approved this exact proof | Approval record pinned to a **specific** proof asset: who, when, asset hash | Terminal unless revised | "Artwork approved" | Customer |
| `CHANGES_REQUESTED` | Customer asked for changes | Decline record + the customer's comments | New proof sent | "Changes requested" | Customer |

> Maps to today's `ART_APPROVED_STATUS_ID` / `DESIGN_NEEDED_STATUS_ID`, which
> `app/api/proof-decision/route.js:51` sets from the customer's decision.

### 3.4 Payment

Detailed rules are `DR-002-05`; these are the states it operates on.

| State | Definition | Entry evidence | Exit evidence | Visible label | Responsible |
|---|---|---|---|---|---|
| `UNPAID` | Nothing received | Default | Any payment posted | "Balance due" | Bookkeeper |
| `PARTIALLY_PAID` | Received > 0 and < total | Payment postings summing below total | Balance reaches zero | "Partially paid" | Bookkeeper |
| `PAID_IN_FULL` | Balance is zero | Postings sum to the total | Refund, dispute or adjustment | "Paid" | System |
| `OVERPAID` | Received more than the total | Postings exceed the total | Refund or credit applied | "Credit on account" | Bookkeeper |
| `REFUND_PENDING` | Refund authorised, not settled | Refund authorisation: who, amount, reason | Refund settles | "Refund in progress" | Owner |
| `REFUNDED` | Refund settled | Provider refund receipt | Terminal | "Refunded" | System |
| `DISPUTED` | Chargeback or dispute open | Provider dispute notification | Dispute resolved | — (internal) | Owner |
| `SETTLED` | Financially final; no balance, no open dispute | Balance zero, no open dispute, job delivered | Terminal | "Complete" | Bookkeeper |

### 3.5 Procurement

| State | Definition | Entry evidence | Exit evidence | Visible label | Responsible |
|---|---|---|---|---|---|
| `NOT_REQUIRED` | Nothing to buy (customer-supplied garments, stock on hand) | CSG flag, or an allocation from stock | Terminal | — | Purchasing |
| `TO_ORDER` | Goods identified, not yet ordered | Job committed with garment lines | PO placed | — | Purchasing |
| `ORDERED` | PO placed with a supplier | Supplier order confirmation + PO number | Goods received | "Garments ordered" | Purchasing |
| `UNKNOWN` | **A supplier submission's outcome is not known** | Timeout / non-response from the supplier API | Reconciled to `ORDERED` or `TO_ORDER` by a human | — | Purchasing |
| `PARTIALLY_RECEIVED` | Some quantity received | Receipt record for less than ordered | All received, or shortage declared | "Garments arriving" | Purchasing |
| `RECEIVED` | Full ordered quantity received and counted | Receipt records summing to ordered qty | Terminal | "Garments received" | Purchasing |
| `SHORTAGE` | Supplier cannot fulfil the remainder | Supplier backorder/cancellation notice | Re-ordered, substituted, or job re-scoped | — | Purchasing |

> **`UNKNOWN` is required, not optional.** Baseline finding **F2**: a
> `place-order` request that times out today leaves no evidence that an order
> may have been placed. ADR-0005 makes `UNKNOWN` a first-class outcome; this is
> the state that represents it. It must never auto-retry.

### 3.6 Production

| State | Definition | Entry evidence | Exit evidence | Visible label | Responsible |
|---|---|---|---|---|---|
| `NOT_READY` | One or more gates unmet (`DR-002-03`) | Default | All required gates cleared | "Preparing your order" | Production |
| `READY` | Every required gate cleared or waived | Gate evaluation result recorded with the evidence per gate | Scheduled | "Ready for production" | Production |
| `SCHEDULED` | Placed on the production calendar | Scheduled date + press/machine assignment | Work starts | "Scheduled" | Production |
| `IN_PRODUCTION` | Being decorated in house | Production start record | Production complete | "In production" | Production |
| `OUTSOURCED` | Sent to a contract decorator | Outbound record: vendor, quantity, due date | Goods returned and counted | "In production" | Purchasing |
| `HOLD` | Stopped mid-production | Hold record: who, when, reason | Released or cancelled | "On hold" | Production |
| `PRODUCED` | Decoration complete and counted | Completed quantity + reject count | Terminal | "Production complete" | Production |

> Printavo has both `in production` and `embroidery in production`. Decoration
> method is a **property of the job**, not a state; one `IN_PRODUCTION` state
> plus a method field replaces both without losing information.

### 3.7 Fulfillment

| State | Definition | Entry evidence | Exit evidence | Visible label | Responsible |
|---|---|---|---|---|---|
| `NOT_READY` | Production incomplete | Default | Production `PRODUCED` | — | Production |
| `READY_FOR_PICKUP` | Awaiting customer collection | Packed + customer notified | Collected | "Ready for pickup" | Production |
| `SHIPPED` | Handed to a carrier | Carrier + tracking number | Delivery confirmation | "Shipped" | Production |
| `PARTIALLY_FULFILLED` | Part of the order delivered | Partial pickup or partial shipment record | Remainder fulfilled | "Partially shipped" | Production |
| `DELIVERED` | Customer has it | Pickup signature or carrier confirmation | Terminal | "Delivered" | System |
| `RETURNED` | Came back — refused, undeliverable, or rejected | Return record + reason | Re-fulfilled or credited | — | Owner |

## 4. Statuses being retired

Printavo statuses with no equivalent above, and where their information goes.

| Printavo status | Disposition |
|---|---|
| `urgent follow up on quote`, `quote follow up complete` | **Not states.** Follow-up is a task on a `SENT` quote, with its own due date. Encoding a to-do as a status is why the list is 21 long. |
| `incomplete action needed` | Too vague to act on. Replaced by the specific unmet gate (`DR-002-03`), which names *what* is missing. |
| `order on hold` | Split: Commercial `CHANGE_REQUESTED` (commercial hold) or Production `HOLD` (shop-floor hold). They need different responses. |
| `feedback request`, `need it again` | Post-delivery marketing activity on a `CLOSED` job, not a job state. |
| `completed` / `complete` | Two spellings of one thing, both mapped to step 5 today. Replaced by Fulfillment `DELIVERED` + Commercial `CLOSED`. |
| `goods in transit` | Procurement `ORDERED`. Note it is currently *also* the marker that garments were purchased — see §2. |

## 5. Worked examples

| # | Scenario | State vector |
|---|---|---|
| 1 | Web quote submitted | Sales `SENT` · Commercial `NOT_COMMITTED` · Artwork `NEEDED` · Payment `UNPAID` · Procurement `TO_ORDER` · Production `NOT_READY` · Fulfillment `NOT_READY` |
| 2 | Customer approved, proof approved, deposit only, garments not in | Sales `ACCEPTED` · Commercial `COMMITTED` · Artwork `APPROVED` · Payment `PARTIALLY_PAID` · Procurement `ORDERED` · Production `NOT_READY` · Fulfillment `NOT_READY` |
| 3 | **The case one status field cannot express** — paid in full, garments received, artwork still awaiting customer approval | Artwork `PROOF_SENT` · Payment `PAID_IN_FULL` · Procurement `RECEIVED` · Production `NOT_READY`. Under Printavo this job must claim to be one of those things and hide the rest. |
| 4 | S&S submission timed out | Procurement `UNKNOWN`. No retry. Alerts Purchasing. Production stays `NOT_READY`. |
| 5 | Supplier short 12 of 48 shirts | Procurement `SHORTAGE`. Production `NOT_READY` (goods gate reopens, `DR-002-04`). |
| 6 | Chargeback on a delivered job | Payment `DISPUTED` · Fulfillment `DELIVERED` · Commercial `COMMITTED` (**not** `CLOSED` — settlement is unfinished) |
| 7 | Exact reorder, artwork unchanged | Artwork `NOT_REQUIRED`, referencing the prior approved asset |
| 8 | Embroidery sent to a contract shop | Production `OUTSOURCED` with vendor and due date; customer sees "In production" |

## 6. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Keep one status field (Printavo's model)** | Cannot represent example 3 above, which is an ordinary Tuesday. It is also why the customer timeline needs a 21-entry lookup table with a silent fallback to step 0. |
| **Adopt Printavo's 21 statuses verbatim into Postgres** | Imports the overloading *and* the hard-coded IDs into the new system, and makes the eventual Printavo retirement a second migration. |
| **Free-text status** | Unqueryable, ungateable, unreportable. |
| **More dimensions (a separate Shipping state, a separate Invoicing state)** | Seven already covers every state named across EPIC-TG-020 through TG-031. More dimensions is more surface for the same information. |
| **Fewer dimensions (merge Sales into Commercial)** | A quote that is `SENT` and a job that is `COMMITTED` have different owners, different documents and different reversibility. Merging them loses the distinction that makes cancellation policy possible. |

## 7. Migration and rollback impact

- **Forward:** during dual-run, each imported Printavo status maps to a state
  vector using §3 and §4. The mapping is **lossy in one direction only** — one
  Printavo status yields a partial vector, with unknown dimensions left at
  their default and marked "derived from Printavo" via provenance
  (ADR-0002), never asserted as observed fact.
- **Rollback:** collapsing a vector back to a single Printavo status **loses
  information**. Any process that writes back to Printavo must pick one
  dimension as the source for that field — recommendation: **Production**,
  because that is what today's `READY_TO_ORDER` / `GOODS_IN_TRANSIT`
  transitions actually gate.
- **Do not delete the Printavo status ID constants** in `lib/printavo.js`
  while dual-run is live. They are the only key back to the external record.

## 8. Open questions for the owner

| # | Question | Safe default until answered |
|---|---|---|
| **Q1** | Is the seven-dimension model right for how Terry runs the shop, or does it describe more process than Americana has? This is the fundamental question in this decision; everything else is detail. | Do not implement any state model. `DR-002-02`/`03`/`04` stay blocked. |
| **Q2** | Are `NOT_REQUIRED`, `SHORTAGE` and `OUTSOURCED` real for Americana today, or aspirational? A state nobody enters is dead weight; a missing state is a workaround. | Keep them. An unused state costs nothing; a missing one gets faked in a notes field. |
| **Q3** | Who is "Bookkeeper" as a system role — Terry, or an external person with an account? This determines whether Payment states need a distinct permission set (EPIC-TG-005). Route with `DR-002-07`. | Treat as a distinct role with no login until confirmed. |
| **Q4** | Should customers see procurement detail ("Garments ordered") or only production progress? It sets expectations Americana may not want to set when a supplier is late. | Show it, as in §3.5. Reversible before launch. |
| **Q5** | Is there a decoration method beyond Screen Printing, Embroidery and DTF (`app/quote/page.jsx:42-44`) with a genuinely different workflow? | Assume not. |

## 9. Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Business owner | Terry | ☐ Accepted ☐ Rejected ☐ Amended | | |
| Architecture | Scott | ☐ Reviewed | | |

Until this is signed, **`DR-002-02`, `DR-002-03`, `DR-002-04` and
EPIC-TG-022/023/024 remain blocked.** No agent may infer a state set from the
Printavo status list.
