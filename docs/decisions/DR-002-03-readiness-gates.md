# DR-002-03 — Required gates by order type

| Field | Value |
|---|---|
| **Decision ID** | `DR-002-03` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Terry's signature** |
| **Owner** | Terry (Americana) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-03 #126](https://github.com/p0wder/asp-webapp/issues/126) |
| **Epic** | [EPIC-TG-002 #75](https://github.com/p0wder/asp-webapp/issues/75) |
| **Depends on** | **`DR-002-01`** |
| **Blocks** | `DR-002-04`, EPIC-TG-023 (multi-gate job readiness), EPIC-TG-024 |
| **Reapproval required when** | A new order type or decoration method is offered, or a gate's clearing evidence changes |

---

## 1. The decision

**A job is `READY` for production when every gate that its order type requires
is cleared by named evidence.** Five gates, six order types, one matrix. A gate
is `REQUIRED`, `NOT_REQUIRED`, or `CONDITIONAL` on a stated condition — never
"usually".

## 2. Why: readiness is currently one Printavo status

Today, readiness is the `READY_TO_ORDER` status
(`lib/printavo.js:212`), and `lib/orderClassification.js:117` treats it as the
sole precondition for spending money with a supplier:

```js
const isReadyToOrder = String(currentStatus?.id) === String(READY_TO_ORDER_STATUS_ID);
```

A human sets that status by hand. Whatever checks they did — was the art
approved, has the customer paid, is this even the right quantity — leave no
record. When a job turns out not to have been ready, there is nothing to
review, because nothing was written down. That is the gap this decision fills:
**the point is not the gate, it is the evidence.**

## 3. The five gates

| Gate | Question | Cleared by | Evidence recorded |
|---|---|---|---|
| **QUOTE** | Is the scope and price agreed? | Customer acceptance of a specific quote revision | Quote number + revision, acceptance actor, timestamp, link or session used |
| **ART** | Has the customer approved this exact artwork? | Artwork `APPROVED`, pinned to one proof asset | Proof asset id **and content hash**, approver, timestamp |
| **PAID** | Is the money in? | Payment balance ≤ 0 per `DR-002-05` | Balance at evaluation, contributing posting ids |
| **GOODS** | Are the garments physically here and counted? | Procurement `RECEIVED`, or a counted customer-supplied delivery | Receipt ids, counted quantity by size/colour, receiver |
| **CAPACITY** | Can the shop actually run it in time? | Scheduled on the production calendar with the required consumables on hand | Scheduled date, machine, consumables check |

**A gate clears against evidence, not against a checkbox.** If the evidence
that cleared a gate is later invalidated — a refund, a shortage, a new proof —
the gate reopens automatically (`DR-002-04`).

## 4. The matrix

`R` required · `N` not required · `C` conditional (condition below)

| Order type | QUOTE | ART | PAID | GOODS | CAPACITY |
|---|---|---|---|---|---|
| **Screen print** | R | R | R | R | R |
| **Embroidery** | R | R | R | R | R |
| **DTF** | R | R | R | R | R |
| **Customer-supplied garments (CSG)** | R | R | R | **R — different evidence (§5.1)** | R |
| **Reorder** | **C1** | **C2** | R | R | R |
| **Store / fundraiser job** | **N (§5.3)** | R (once, at store setup) | **C3** | R | R |

### Conditions

- **C1 — Reorder QUOTE.** Not required if the reorder is *identical* in
  garment, quantity, decoration and price to a job delivered within the last
  **90 days**. Any difference, including a supplier price change that moves
  the total, makes it `REQUIRED`. Evidence when waived by condition: the prior
  job number, plus a recorded comparison showing the four attributes match.
- **C2 — Reorder ART.** Not required if artwork is byte-identical to the prior
  approved proof. Evidence: the prior approval record **and** a content-hash
  match against the prior approved asset (ADR-0006). **A visual "looks the
  same" judgement does not clear this gate.** Any change — a size tweak, a
  colour substitution, a new placement — makes it `REQUIRED`.
- **C3 — Store PAID.** Cleared per *customer order* at online checkout, not
  per production job. The production job for a store run is gated on **every
  contributing order being paid**; one unpaid order in the batch does not
  block the other 40, it is excluded from the run.

## 5. Order-type notes

### 5.1 Customer-supplied garments

The GOODS gate is **required**, not waived — it changes what counts as
evidence:

- A **counted-in receipt** against the customer's delivery: quantity by size
  and colour, condition, who counted, when.
- A recorded **spoilage allowance** agreed with the customer before
  production. There are no spare garments to replace a mis-print, so who bears
  a ruined shirt must be settled *before* the press runs, not after.
- If the count is short of the job quantity, the gate does not clear.

This is the order type where an unrecorded gate hurts most: Americana cannot
buy a replacement for a garment the customer supplied.

### 5.2 Reorders

A reorder is where gates get skipped in practice, because "it's the same as
last time" is usually true. C1 and C2 keep that efficiency but force the
comparison to be *recorded* — and to be a hash comparison for artwork, not an
opinion. The 90-day window on C1 exists because supplier pricing moves; past
it, re-quote.

### 5.3 Store and fundraiser jobs

The QUOTE gate is not required per job because the commercial terms are agreed
once, when the store is set up, and each customer order is a purchase at
published prices. **That store-setup agreement is itself gated** — it needs the
same acceptance evidence a quote would — but it is agreed once, not per run.

Scoped by EPIC-TG-035; these rows are provisional until that epic is specified,
and should be re-confirmed then.

## 6. Worked examples

| # | Scenario | Gate result |
|---|---|---|
| 1 | Screen print, 48 shirts, proof approved, paid in full, garments received, scheduled | All five clear → Production `READY` |
| 2 | Same, but garments 12 short | GOODS not cleared → `NOT_READY`. Others stay cleared. |
| 3 | Same, but customer paid a 50% deposit | PAID not cleared → `NOT_READY`. Proceeding needs an Owner waiver (`DR-002-04`). |
| 4 | Embroidery, customer approved proof, then asked for a thread colour change | ART reopens → `NOT_READY` until a new proof is approved |
| 5 | Reorder, identical, delivered 40 days ago | QUOTE and ART clear by C1/C2 with the comparison recorded. PAID, GOODS, CAPACITY still required. |
| 6 | Reorder, identical artwork, but 72 shirts instead of 48 | C1 fails (quantity differs) → QUOTE required. C2 still clears on hash match. |
| 7 | Reorder, "same design, just make the logo a bit bigger" | C2 fails — hash differs → ART required. This is exactly the case C2 exists to catch. |
| 8 | CSG, customer dropped off 50 shirts for a 48-piece job | GOODS clears on the counted receipt; the 2 spares are the recorded spoilage allowance |
| 9 | CSG, customer dropped off 46 for a 48-piece job | GOODS does not clear. Re-scope to 46 or wait. |
| 10 | Store run, 40 orders, 39 paid | Job runs the 39. The unpaid order is excluded, not blocking (C3). |
| 11 | All gates clear but no press time this week | CAPACITY not cleared → `READY` but not `SCHEDULED`. **This is a schedule problem, not a readiness failure**, and it is why CAPACITY is a separate gate. |
| 12 | Customer refunded after everything cleared | PAID reopens → `READY → NOT_READY` (`DR-002-04`) |

## 7. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **One "ready" flag set by a human (status quo)** | No evidence, no reason, no way to review a bad call. `READY_TO_ORDER` is exactly this today. |
| **The same gates for every order type** | Forces CSG through a purchase-order gate that will never clear, so staff learn to bypass gates. A rule that must be broken to work is worse than no rule. |
| **Gates as a per-job checklist staff tick** | A tick is not evidence. Ticking is exactly as fast whether or not the customer paid. |
| **Fold CAPACITY into scheduling and drop the gate** | Then "ready" means "ready except we have no press", and the readiness report cannot answer the shop's real question. Example 11 is the distinction. |
| **Let ART clear on a visual comparison for reorders** | The one thing a proof approval is *for* is proving what the customer approved. A judgement call defeats it. Hence the hash requirement in C2. |
| **Make PAID conditional by customer (net-30 accounts)** | A real business need, but it is a *waiver policy*, not a gate condition — it belongs in `DR-002-04` where it carries an authority, a reason and an expiry. See Q2. |

## 8. Migration and rollback impact

- **Forward:** gate evaluation is additive and initially **advisory** — compute
  and record it alongside the existing `READY_TO_ORDER` status, and compare.
  A week of disagreements between the two is the cheapest possible validation
  of this matrix before it blocks anything.
- **Enforcement is a separate, flagged step** (ADR-0007 rollout flag). Turning
  it on is reversible; the recorded evaluations are not lost either way.
- **Rollback:** revert to the human-set status. Gate evaluation records are
  append-only and remain as evidence of what would have been blocked.
- **Do not backfill gate evaluations onto historical jobs.** There is no
  evidence to backfill from, and a fabricated clear is worse than a gap.

## 9. Open questions for the owner

| # | Question | Safe default until answered |
|---|---|---|
| **Q1** | Is 90 days the right reorder window (C1)? It should reflect how often S&S pricing moves enough to matter. | 90 days. |
| **Q2** | Do any customers have terms — net 30, schools, a standing account — where PAID is not required before production? This is common in this industry and the matrix as written has no row for it. | PAID required for everyone; exceptions go through an Owner waiver (`DR-002-04`) so they are at least recorded. **Route with `DR-002-05`.** |
| **Q3** | Is CAPACITY a gate Americana wants, or is scheduling handled informally? It is the one gate with no current analogue in the code. | Include it as advisory only, not blocking, until confirmed. |
| **Q4** | For CSG, what spoilage allowance does Americana ask for as standard (§5.1)? | No default — must be agreed per job and recorded. |
| **Q5** | Do the store rows survive contact with EPIC-TG-035, or should they be deferred until it is specified? | Treat store rows as provisional. |
| **Q6** | Should a "rush" order type exist with different gates? Nothing in the repository suggests one today. | No rush type. A rush job is a normal job with a nearer due date. |

## 10. Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Business owner | Terry | ☐ Accepted ☐ Rejected ☐ Amended | | |
| Architecture | Scott | ☐ Reviewed | | |

Blocked behind `DR-002-01`. **`DR-002-04` cannot be signed before this one** —
a waiver policy needs a gate list to waive against.
