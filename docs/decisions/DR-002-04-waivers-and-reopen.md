# DR-002-04 — Owner waiver and reopen rules

| Field | Value |
|---|---|
| **Decision ID** | `DR-002-04` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Terry's signature** |
| **Owner** | Terry (Americana) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-04 #127](https://github.com/p0wder/asp-webapp/issues/127) |
| **Epic** | [EPIC-TG-002 #75](https://github.com/p0wder/asp-webapp/issues/75) |
| **Depends on** | **`DR-002-03`** — a waiver policy needs a gate list |
| **Blocks** | EPIC-TG-023, EPIC-TG-024, EPIC-TG-030 |
| **Reapproval required when** | A gate is added or removed, waiver authority is delegated, or a non-waivable gate is challenged |

---

## 1. The decision

**Three of the five gates may be waived, by Terry alone, with a written reason
and an expiry. Two may never be waived by anyone.** A gate reopens
automatically whenever the evidence that cleared it stops being true, and a
reopen on a job already in production alerts immediately.

## 2. Why a waiver policy is the point

A gate policy without a waiver policy produces one of two outcomes, both bad:
staff work around the gates, or the shop stops. Americana is a small business
where "run it anyway, I know these people" is sometimes the right call.

The purpose of this decision is **not** to prevent that call. It is to make it
leave a record: who made it, why, on which job, and what happened next. A
waiver is a *recorded exception*, and its value is entirely in the recording.

## 3. Waivable and non-waivable gates

Gates are defined in `DR-002-03` §3.

| Gate | Waivable? | Authority | Notes |
|---|---|---|---|
| **QUOTE** | ✅ Yes | Owner | Verbal orders from known customers. The commercial risk is Americana's own. |
| **PAID** | ✅ Yes | Owner | Terms customers, trusted accounts, deposits. The single most common waiver — see `DR-002-03` Q2. |
| **CAPACITY** | ✅ Yes | Owner or Production | Committing to a run before the calendar is confirmed. Lowest-risk waiver. |
| **ART** | ❌ **Never** | — | See §3.1 |
| **GOODS** | ❌ **Never** | — | See §3.2 |

### 3.1 ART is non-waivable

A customer's approval of a specific proof is Americana's evidence of what was
authorised. Waiving it means printing artwork nobody agreed to, and if it is
wrong, the cost is the full job — garments, labour and press time — with no
recourse. There is no version of this that is cheaper than waiting for an
approval.

**The narrow exception is already handled without a waiver:** an exact reorder
clears ART by condition C2 in `DR-002-03` on a content-hash match against the
prior approved asset. That is a *clear*, not a waiver, and it carries real
evidence.

### 3.2 GOODS is non-waivable

You cannot print on garments that are not in the building. This gate is not a
policy judgement, it is a physical fact, and a waiver would express a
falsehood.

**What looks like a GOODS waiver is a re-scope:** if 36 of 48 shirts arrived
and the customer agrees to take 36 now, the *job quantity changes to 36*, and
the gate then clears honestly against 36. The remaining 12 become a new job or
a shortage record (`DR-002-02` §4.5). This distinction matters — one produces
a correct record and a correct invoice; the other produces a job that claims
48 shirts exist.

## 4. Waiver authority

- **Terry (Owner) is the only waiver authority** for QUOTE and PAID at day
  one. CAPACITY may additionally be waived by Production.
- **No delegation without a new signed decision.** If Terry wants a manager to
  hold PAID authority, that is an amendment to this document naming the
  person, not a permission granted in a settings screen.
- **A waiver cannot be granted by the person who benefits from it.** If Terry
  is also the salesperson on a job, that is acceptable in a shop this size —
  but the waiver is still recorded, and that is the control.
- **Waiver authority does not transfer with a role change.** It is attached to
  a named person in this document.

## 5. Required fields

Every waiver record carries, without exception:

| Field | Requirement |
|---|---|
| `id` | Surrogate key (ADR-0002) |
| `job_id` | The job. **A waiver is never customer-wide or standing.** |
| `gate` | One of QUOTE, PAID, CAPACITY |
| `granted_by` | Named person — never a role, never "system" |
| `granted_at` | `timestamptz` (ADR-0003) |
| `reason` | **Free text, minimum 20 characters, mandatory.** "ok" is not a reason. |
| `evidence_ref` | Optional: an email, a PO number, a call note. Strongly encouraged on PAID. |
| `expires_at` | **Mandatory** — see §6 |
| `revoked_at` / `revoked_by` | Set if withdrawn before expiry |
| `superseded_by` | Set if replaced by a later waiver on the same gate |

Waiver records are **append-only**. A waiver is never edited or deleted; it is
revoked or superseded. This is the epic's "do not delete evidence" requirement
applied to a business record rather than a failed operation.

## 6. Expiry

**A waiver expires at the earlier of:**

- **job completion** (Fulfillment `DELIVERED`), or
- **30 days** from `granted_at`.

On expiry the gate **re-evaluates against real evidence**. If the underlying
condition is still unmet, the gate closes and the job returns to `NOT_READY`.

The reason for a time limit: a waiver is a decision about a job *as it stands
today*. A PAID waiver granted in March for a job that stalls until June is no
longer the decision Terry made — circumstances, and the customer's balance,
have moved. Expiry forces the call to be made again rather than inherited.

**A waiver may be renewed** by granting a new one. The renewal is a separate
record, so a job carrying three consecutive PAID waivers reads that way in the
audit trail — which is the signal a reviewer needs.

## 7. Reopen triggers

A gate reopens **automatically** when the evidence that cleared it stops being
true. Reopening is not a human action and cannot be suppressed.

| Trigger | Gate reopened | Detected by |
|---|---|---|
| Refund issued or authorised | PAID | Payment `→ REFUND_PENDING` / `REFUNDED` |
| Chargeback or dispute opened | PAID | Payment `→ DISPUTED` |
| Invoice total increased (added lines, quantity up, price correction) | PAID | Balance recomputation |
| Supplier shortage or backorder | GOODS | Procurement `→ SHORTAGE` |
| Received count short of job quantity | GOODS | Receipt posting |
| Contract decorator returns fewer than sent | GOODS | Outsourced return count (`DR-002-02` §6) |
| New proof sent after an approval | ART | Artwork `APPROVED → CHANGES_REQUESTED` |
| Quantity, garment or decoration spec changed | QUOTE **and** ART | Job revision created |
| Scheduled slot lost (machine down, press reassigned) | CAPACITY | Schedule change |
| **A waiver expires or is revoked** | Whichever it covered | Expiry sweep |

**A reopen is recorded with the same rigour as a clear:** which gate, what
triggered it, when, and the evidence that invalidated the previous clear.

## 8. Production response to a reopen

This is the part that costs money if it is wrong. **The response depends
entirely on where the job already is.**

| Production state when the gate reopens | Response |
|---|---|
| `NOT_READY` | Nothing to do — already blocked. |
| `READY` | → `NOT_READY`. Silent; no alert. This is the system working. |
| `SCHEDULED` | → `NOT_READY`, **removed from the calendar**, Production notified. The slot is freed for another job. |
| `IN_PRODUCTION` | **→ `HOLD` immediately. Alert the Owner and Production now.** Do not auto-resume when the gate re-clears — a human decides whether to continue. |
| `OUTSOURCED` | **Alert the Owner immediately.** Do **not** auto-recall from the vendor; goods are off-site and a recall is a commercial conversation. |
| `PRODUCED` | **Do not reverse production.** Garments are decorated; the cost is sunk. The gate reopen becomes a *commercial* matter — collect, credit, or absorb — routed to the Owner. |
| Fulfillment `SHIPPED` or `DELIVERED` | Commercial only. Never affects the shop floor. |

Two rules that hold across every row:

1. **A reopen never destroys work in progress.** It stops the *next* step. A
   press that is running finishes its sheet.
2. **`IN_PRODUCTION` and `OUTSOURCED` reopens are always human-decided.**
   The system holds and alerts; it does not resume, recall or cancel by
   itself.

## 9. Alerts

| Event | Recipient | Timing |
|---|---|---|
| Waiver granted | Owner | Daily digest |
| **PAID waiver granted** | Owner | **Immediate** — this is the one with direct cash exposure |
| Waiver expires with the gate still unmet | Owner | Immediate |
| Gate reopens on a `READY` job | Production | Daily digest |
| **Gate reopens on an `IN_PRODUCTION` or `OUTSOURCED` job** | Owner **and** Production | **Immediate** |
| Third consecutive waiver on one job | Owner | Immediate — a pattern, not an exception |
| Any waiver on a job that later goes unpaid past 30 days | Owner | Immediate |

Alert delivery follows `DR-002-11`. **A waiver alert is transactional and
internal** — it is never suppressible by a customer preference.

## 10. Worked examples

| # | Scenario | Result |
|---|---|---|
| 1 | Terry waives PAID for a school on a purchase order | Waiver recorded: gate PAID, reason "School PO 4471 received, net 30 terms", `evidence_ref` = PO number, expires in 30 days. Owner alerted immediately. Job → `READY`. |
| 2 | That job is still unshipped 31 days later | Waiver expires. PAID re-evaluates, balance still owing → job → `NOT_READY`. Owner alerted. Terry renews or chases payment. |
| 3 | Customer requests an art change on a job already `SCHEDULED` | ART reopens. Job → `NOT_READY`, removed from the calendar, Production notified. **No waiver is possible** — ART is non-waivable. |
| 4 | Chargeback lands on a job mid-run | PAID reopens → Production `HOLD`. Owner and Production alerted immediately. Terry decides whether to finish the run. |
| 5 | 36 of 48 shirts arrive; customer will take 36 now | **Not a waiver.** Job re-scoped to 36; GOODS clears against 36; the 12 become a shortage record. Invoice reflects 36. |
| 6 | Terry says "just run it, the shirts are on the truck" | **Refused.** GOODS is non-waivable (§3.2). The nearest legitimate action is example 5, once the goods are counted in. |
| 7 | Contract decorator returns 46 of 48 | GOODS reopens on the return count. Job was `OUTSOURCED` → Owner alerted, no automatic recall. |
| 8 | Third PAID waiver on the same job in two months | Granted if Terry grants it — **and** flagged as a pattern to the Owner. The policy records; it does not refuse. |
| 9 | Job delivered, then a dispute opens | PAID reopens. Fulfillment `DELIVERED`, so commercial only. Commercial `CLOSED → COMMITTED` (`DR-002-02` §4.2). Shop floor untouched. |
| 10 | CAPACITY waived, press then breaks | CAPACITY reopens on the schedule change. Job → `NOT_READY`. The earlier waiver does not survive the new fact. |

## 11. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **All gates waivable by the Owner** | Makes the ART and GOODS gates advisory. §3.1 and §3.2 give the cost of each. |
| **No waivers at all** | Staff work around the system. An unrecorded workaround is strictly worse than a recorded exception — it is the status quo, where a human sets `READY_TO_ORDER` with no record of what they checked. |
| **Waivers that never expire** | A decision about a job in March silently governs that job in June. §6. |
| **Standing per-customer waivers ("this school is always net 30")** | A real business need, but it is a **customer terms** feature, not a waiver — it belongs in a customer record with its own approval, so it is visible on every job rather than buried in one. Deferred; see Q3. |
| **Auto-resume production when a gate re-clears** | A job that was halted mid-run has physical state — a press torn down, garments moved — that the system cannot see. Resuming is a human call. |
| **Reversing production on a reopen** | Decoration is not reversible. Pretending otherwise in the state model produces states that cannot exist. |
| **Letting the reopen be suppressed for "known" cases** | A suppressible control is not a control. If a reopen is wrong, fix the evidence, not the alarm. |

## 12. Migration and rollback impact

- **Forward:** additive. A `gate_waiver` table and a reopen evaluator. Waivers
  did not exist before, so there is nothing to backfill — and nothing *should*
  be backfilled, because no historical job has a recorded reason.
- **Sequencing:** ship reopen detection **in advisory mode first**, alongside
  the existing manual status. Watching what it *would* have reopened for a few
  weeks is the cheapest validation of §7 available, and it costs nothing.
- **Rollback:** enforcement sits behind a rollout flag (ADR-0007). Waiver
  records are append-only and survive a rollback as evidence.
- **One caution:** if enforcement is turned on before waivers work, every job
  that would have needed one stops. **Waiver granting must ship before or with
  gate enforcement, never after.**

## 13. Open questions for the owner

| # | Question | Safe default until answered |
|---|---|---|
| **Q1** | Is Owner-only waiver authority workable when Terry is unavailable? A single authority is a single point of failure on a shop floor. | Owner-only. Delegation needs a named person and an amendment. |
| **Q2** | Is 30 days the right waiver lifetime? It should be a little longer than a normal job turnaround. | 30 days. |
| **Q3** | Should standing customer terms (net 30 for schools) exist as a customer attribute rather than a per-job waiver? This is the same question as `DR-002-03` Q2 and `DR-002-05` Q1 — **answer it once, for all three.** | Per-job waivers only. |
| **Q4** | Confirm ART and GOODS are genuinely non-waivable in Terry's judgement. If Terry disagrees on either, that changes this document materially and §3 should be re-argued rather than quietly amended. | Non-waivable. |
| **Q5** | On an `IN_PRODUCTION` reopen, should the system hold the job automatically (as written) or only alert and leave it running? | Hold. Stopping is recoverable; finishing a run that should not have been finished is not. |
| **Q6** | Who receives alerts when Terry is away? | Owner only. |

## 14. Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Business owner | Terry | ☐ Accepted ☐ Rejected ☐ Amended | | |
| Architecture | Scott | ☐ Reviewed | | |

Blocked behind `DR-002-03`, which is blocked behind `DR-002-01`. All three
must be signed before any gate or waiver logic is implemented.
