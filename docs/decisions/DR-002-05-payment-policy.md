# DR-002-05 — Partial-payment, refund, dispute and adjustment rules

| Field | Value |
|---|---|
| **Decision ID** | `DR-002-05` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Terry's signature** |
| **Owner** | Terry (Americana) · consulted: Bookkeeper (§6, §9) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-05 #128](https://github.com/p0wder/asp-webapp/issues/128) |
| **Epic** | [EPIC-TG-002 #75](https://github.com/p0wder/asp-webapp/issues/75) |
| **Depends on** | TG-001-01 (closed) · ADR-0003 (money) · ADR-0005 (webhook receipts) |
| **Blocks** | TG-001-04, TG-001-05, EPIC-TG-031 (payment ledger), EPIC-TG-023 |
| **Reapproval required when** | The default payment term changes, a new payment method is accepted, or standing customer terms are introduced |

---

## 1. The decision

**Default: 100% paid before production.** The PAID gate clears when the
server-derived balance is zero or below. Exceptions exist, are Owner-granted,
and are recorded as waivers (`DR-002-04`) — never as an adjusted balance.

Two structural rules underpin everything else:

- **Balance is derived, never stored as a mutable number.** It is the sum of
  an append-only ledger. Nothing "sets" a balance.
- **The customer's paid amount is gross.** Processor fees are Americana's
  expense and never reduce what the customer is credited.

## 2. Why: what is broken today

Three baseline findings converge on this decision.

**F3 — the charge amount comes from the client.** `app/pay/page.jsx:18` seeds
`amountCents` from the `?amount=` **query parameter**, holds it in client
state, and posts it (`:34`). `app/api/create-payment-session/route.js:13`
destructures it straight from the request body and hands it to Stripe (`:54`).
Validation is type-only — `Number.isInteger(amountCents) && amountCents > 0`
(`:19`). **The amount is never compared against the invoice balance.** A
customer can edit the URL and pay $1.00 against any invoice.

The route *does* fetch the invoice (`:28`) and 404s if it does not exist — so
the fix is small, and TG-001-04 owns it. But it tells you the shape of the
current model: **there is no server-side notion of what is owed.**

**F4 — a payment can be recorded twice, or not at all.** The Stripe webhook
has no receipt table and no deduplication, so an at-least-once redelivery of
`checkout.session.completed` records the payment on the Printavo invoice
**twice**. And on failure the handler logs and returns HTTP 200, with the
comment *"Non-fatal: log but still return 200 so Stripe doesn't retry"* — so a
**collected payment is silently not recorded**, and the 200 suppresses the one
mechanism that would have fixed it.

**There is no ledger.** Payment state lives in Printavo, written by an inline
GraphQL mutation in the route handler (**V9**). Nothing in this application
can answer "what is owed on this job?" from its own records.

**This decision is what TG-001-04 and TG-001-05 implement against.** Without
it, "derive the amount from the server-owned balance" has no definition of
*balance*.

## 3. The ledger

1. **Every money event is an append-only posting**: charge, payment, refund,
   dispute hold, dispute reversal, credit, write-off, adjustment.
2. **A posting is never edited or deleted.** A mistake is corrected by a
   reversing posting that references the original.
3. **`balance_due = sum(charges) − sum(payments) + sum(refunds) +
   sum(open disputes)`**, in integer cents (ADR-0003).
4. **Every posting carries provenance**: source (Stripe, cash, check, manual),
   external reference (Stripe payment intent, check number), actor, timestamp,
   and — for anything not machine-sourced — a reason.
5. **Provider events are receipts, not commands** (ADR-0005). The Stripe event
   id is stored under a `UNIQUE` constraint *before* any effect is applied, so
   a redelivery is a no-op. This is the F4 fix.
6. **A posting is acknowledged only once durably stored.** The webhook returns
   2xx after the receipt commits; a failure to apply leaves the receipt
   `PENDING` for a retry worker. **The current "log and return 200" is
   inverted and must go.**

## 4. The PAID gate

- **Clears when `balance_due <= 0`.**
- **Tolerance is $0.00 at day one.** No "close enough". A residual cent is a
  write-off posting by the bookkeeper — visible, explainable, and one action —
  not an invisible threshold. See Q4.
- **A waiver clears the gate; it never changes the balance.** An Owner PAID
  waiver (`DR-002-04`) lets production proceed with the balance intact. This
  distinction is the whole design: **the money owed and the permission to
  produce are different facts**, and merging them destroys the accounts
  receivable figure.
- **The gate re-evaluates on every posting.** It reopens automatically if the
  balance goes positive again (`DR-002-04` §7).

## 5. Rules by event

### Deposits and partial payments

A deposit is an ordinary payment posting. It moves Payment state to
`PARTIALLY_PAID` and **does not clear the PAID gate**. Producing against a
deposit requires an Owner waiver. Americana may *request* a deposit — that is a
commercial practice — but the system has no separate "deposit" concept, because
a deposit is just a payment that has not reached the total.

### Overpayment

- The balance goes negative; Payment state → `OVERPAID`; the gate clears.
- **Never auto-refund.** An overpayment is a credit until Terry or the
  bookkeeper decides between a refund and credit-on-account.
- A credit applied to another job of the same customer is two postings — a
  credit-out and a credit-in — never a silent transfer.

### Refunds

- **Owner-authorised only.** No automatic refund path exists, including for
  cancellations.
- A refund posting increases the balance. If that takes it above zero, the
  PAID gate reopens (`DR-002-04` §7) and the production response depends on
  where the job is (`DR-002-04` §8).
- A refund on a `DELIVERED` job is commercial only and never touches the shop
  floor.
- Refunds go back **by the original method** where the processor supports it.

### Disputes and chargebacks

- On a dispute notification: post a **dispute hold** for the disputed amount.
  The balance rises; the PAID gate reopens **immediately**.
- **Do not ship a disputed job without an Owner waiver.** A job in production
  goes to `HOLD` and alerts (`DR-002-04` §8).
- Dispute won → reverse the hold, balance returns. Dispute lost → the hold
  converts to a refund posting.
- **Dispute fees are an expense posting, never a customer charge**, unless
  Terry decides otherwise per case (Q3).

### Processor fees

- **Fees never reduce the customer's credited payment.** A $500.00 payment
  credits $500.00; Stripe's fee is a separate expense posting.
- Getting this wrong is the classic small-business ledger bug: net-crediting
  leaves every fully-paid invoice showing a small balance forever, and every
  one of those becomes a support conversation.
- Whether fees are ever passed to customers as a surcharge is Q3.

### Adjustments and write-offs

- **Bookkeeper only**, with a mandatory reason.
- A write-off closes a residual balance without claiming payment was received —
  the two must never be confused, because one is revenue and one is not.
- Adjustments are postings. They never edit an existing posting.

## 6. Worked examples

Job `J-100412`, invoice total **$1,000.00** (100,000 cents).
"Gate" = the PAID gate in `DR-002-03`.

| # | Event | Postings | Balance | Payment state | Gate |
|---|---|---|---|---|---|
| 1 | Invoice issued | charge +100,000 | $1,000.00 | `UNPAID` | ✖ blocked |
| 2 | **Deposit** — customer pays $500.00 | payment −50,000 | $500.00 | `PARTIALLY_PAID` | ✖ blocked |
| 3 | Terry waives PAID to start production | *no posting* — waiver only | **$500.00 (unchanged)** | `PARTIALLY_PAID` | ✔ **waived** |
| 4 | **Exact payment** — remaining $500.00 | payment −50,000 | $0.00 | `PAID_IN_FULL` | ✔ cleared on merit |
| 5 | Stripe redelivers that same event | *none* — duplicate event id rejected (ADR-0005 §6) | $0.00 | `PAID_IN_FULL` | ✔ |
| 6 | **Processor fee** $14.80 on the payment | expense −1,480 (Americana's books) | **$0.00 — unchanged** | `PAID_IN_FULL` | ✔ |
| 7 | **Overpayment** — customer pays $100.00 more | payment −10,000 | **−$100.00** | `OVERPAID` | ✔ |
| 8 | Terry credits the $100 to the customer's next job | credit-out +10,000 here, credit-in −10,000 there | $0.00 | `PAID_IN_FULL` | ✔ |
| 9 | **Refund** — $200.00 approved for a quality issue | refund +20,000 | **$200.00** | `REFUND_PENDING` → `REFUNDED` | ✖ **reopened** |
| 10 | Job was `IN_PRODUCTION` at step 9 | — | $200.00 | `REFUNDED` | Production → `HOLD`, Owner alerted |
| 11 | Job was `DELIVERED` at step 9 | — | $200.00 | `REFUNDED` | Commercial only; shop floor untouched |
| 12 | **Dispute** — $1,000.00 chargeback filed | dispute hold +100,000 | **$1,000.00** | `DISPUTED` | ✖ **reopened immediately** |
| 13 | Dispute won | hold reversed −100,000 | $0.00 | `PAID_IN_FULL` | ✔ |
| 14 | Dispute lost | hold → refund | $1,000.00 | `REFUNDED` | ✖ |
| 15 | **Owner exception** — school PO, net 30, nothing paid | waiver, reason + PO ref, 30-day expiry | **$1,000.00** | `UNPAID` | ✔ **waived**, Owner alerted immediately |
| 16 | Job unshipped 31 days later | waiver expires | $1,000.00 | `UNPAID` | ✖ **reopened**, Owner alerted |
| 17 | Residual **$0.03** after a rounding difference | — | $0.03 | `PARTIALLY_PAID` | ✖ blocked — needs a write-off posting (§4) |
| 18 | Bookkeeper writes off the $0.03 | write-off −3, reason recorded | $0.00 | `PAID_IN_FULL` | ✔ |
| 19 | Customer pays $1.00 via an edited URL | payment −100 | **$999.00** | `PARTIALLY_PAID` | ✖ blocked — **and under TG-001-04 the session is never created at that amount** |

Rows 3, 6 and 15 carry the three rules most likely to be implemented wrong: a
waiver does not move the balance, a fee does not move the balance, and an
exception is a waiver rather than a discount.

## 7. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Keep client-supplied `amountCents` (status quo)** | Finding F3: a customer can pay $1.00 against any invoice by editing a URL. |
| **A mutable `balance` column** | Every bug becomes an unexplainable number with no way to reconstruct how it got there. Postings can always be re-summed. |
| **Net-crediting processor fees** | Every paid invoice retains a small phantom balance, and every one becomes a customer conversation. |
| **Auto-refunding overpayments** | Moves money without a human decision, and the common cause of an overpayment is a duplicate payment that should be *credited*, not refunded. |
| **A tolerance band on the PAID gate** | Hides small errors instead of surfacing them, and the band becomes the de-facto discount policy. A write-off is one visible action (row 18). |
| **Letting a waiver zero the balance** | Destroys accounts receivable. Terry would have no way to know what customers owe. |
| **Trusting Stripe's own dedup** | Stripe delivers at least once by design. Dedup is the receiver's job (ADR-0005). |
| **Returning 200 on a failed write to keep Stripe quiet (status quo)** | Finding F4. It converts a retryable failure into a silent, permanent loss of a recorded payment. |

## 8. Migration and rollback impact

- **Forward:** the ledger is additive. During dual-run, Printavo remains the
  system of record for payments; postings mirror it with provenance
  (ADR-0002), and the two are reconciled before the ledger becomes
  authoritative.
- **A reconciliation report — ledger balance versus Printavo balance, per
  invoice — must be clean before cutover.** It is also the best available test
  of this policy: any disagreement is either a bug or an unwritten rule.
- **Rollback:** while Printavo is authoritative, rollback is dropping the
  mirror. After cutover, the ledger *is* the accounting record and cannot be
  rolled back — only corrected forward with reversing postings. **This is the
  one decision in EPIC-TG-002 with an irreversible cutover point.**
- **TG-001-04 does not wait for the ledger.** Deriving the Stripe amount from
  the invoice balance already in hand (`create-payment-session/route.js:28`)
  closes F3 against Printavo today. Do not block a P0 safety fix on this
  decision.

## 9. Open questions for the owner

| # | Question | Safe default until answered |
|---|---|---|
| **Q1** | Do any customers have standing terms (net 30, schools, recurring accounts)? **Same question as `DR-002-03` Q2 and `DR-002-04` Q3 — answer once.** | Per-job Owner waivers. Everyone is 100%-before-production until waived. |
| **Q2** | Is a deposit percentage standard for large orders, and if so what triggers it? | No standard deposit. Terry asks per job. |
| **Q3** | Are processor fees ever passed to the customer as a surcharge, and who bears a dispute fee? Card-network rules constrain surcharging — **route to the bookkeeper.** | Americana absorbs both. |
| **Q4** | Is a $0.00 tolerance workable, or does the bookkeeper want a small auto-write-off threshold? | $0.00. Row 17–18 is the path. |
| **Q5** | What non-card methods must the ledger accept at day one — cash, check, ACH, terminal? Each needs a posting source and someone who may record it. | Cash and check, recordable by the Bookkeeper only. |
| **Q6** | On cancellation of a job with a deposit, is the deposit refundable, partly refundable, or retained against committed cost? `DR-002-02` §5 requires committed cost to be dispositioned but does not say who bears it. | No default — **Owner decision per cancellation.** |
| **Q7** | Who besides the bookkeeper may post a manual payment (a cash sale at the counter)? | Bookkeeper only. |

## 10. Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Business owner | Terry | ☐ Accepted ☐ Rejected ☐ Amended | | |
| Consulted (Q3, Q4) | Bookkeeper | ☐ Confirmed | | |
| Architecture | Scott | ☐ Reviewed | | |

Until signed, **EPIC-TG-031 remains blocked.** TG-001-04 and TG-001-05 are
**not** blocked by this decision — see §8 — and should proceed against
Printavo balances now.
