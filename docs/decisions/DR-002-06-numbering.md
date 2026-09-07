# DR-002-06 — Quote, order/job, PO and receipt numbering

| Field | Value |
|---|---|
| **Decision ID** | `DR-002-06` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Terry's signature** |
| **Owner** | Terry (Americana) · consulted: Scott (architecture) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-06 #129](https://github.com/p0wder/asp-webapp/issues/129) |
| **Epic** | [EPIC-TG-002 #75](https://github.com/p0wder/asp-webapp/issues/75) |
| **Depends on** | TG-001-01 (closed), ADR-0002 (machine identity) |
| **Blocks** | TG-003-04, EPIC-TG-009 (importer), EPIC-TG-029 (purchasing), EPIC-TG-030 (receiving) |
| **Reapproval required when** | A sequence approaches its width, a second entity starts issuing numbers, or Printavo numbering is retired from customer-facing use |

---

## 1. The decision

Four independent, prefixed, zero-padded sequences. Imported Printavo numbers
are **retained as permanent aliases** and are never re-issued into the new
sequences.

| Record type | Format | First number | Example |
|---|---|---|---|
| Quote | `Q-` + 6 digits | `Q-100001` | `Q-100347` |
| Order / Job | `J-` + 6 digits | `J-100001` | `J-100347` |
| Purchase order | `PO-` + 6 digits | `PO-100001` | `PO-100052` |
| Receipt (goods received) | `R-` + 6 digits | `R-100001` | `R-100052` |

Distinct prefixes mean no new number can ever collide with a Printavo number,
which is a bare integer (`1234`). A Printavo record is always displayed as
`Printavo #1234`, never as a bare number that could be mistaken for one of the
above.

## 2. Why this needs deciding now

**Printavo's `visualId` is doing three jobs at once today**, and all three
break at cutover:

1. It is the customer-facing number on quotes and invoices.
2. It is the **purchase-order number sent to S&S** — `createSSOrder` takes a
   `poNumber` (`lib/ssActivewear.js`), and orders are looked back up with
   `getSSOrdersByPO(visualIdOrPoNumber)` (`lib/ssActivewear.js:590`), which
   accepts `"1234"`, `"#1234"` or a comma-separated list.
3. It is the **storage path** for order-attribution records in Vercel Blob —
   `lib/orderAttribution.js:26` builds the path from the URL-encoded
   `visualId`.

So the day Americana stops creating Printavo records, it also loses its PO
numbering scheme and its attribution key unless this decision is in place
first. That is why a P1 numbering ticket sits in Wave 0.

## 3. Rules

### 3.1 Allocation and concurrency

1. Numbers come from a **Postgres sequence per record type**, allocated inside
   the same transaction that inserts the record. Two concurrent inserts cannot
   receive the same number.
2. **Sequences are monotonic but not gap-free.** A rolled-back transaction
   consumes its number permanently. **A gap is not an error and must never be
   investigated as one** — this is the single most common misunderstanding of
   database sequences and it is worth stating in the policy rather than
   discovering during an audit.
3. If gap-free numbering is ever *required* (see Q2), it must be implemented
   as a separate counter table with row locking, at a real cost in write
   concurrency. It is not the default here.
4. **A number is allocated once and is immutable.** Editing a quote, revising
   artwork or changing quantities does not re-number it.

### 3.2 Void, cancel and reuse

5. **A voided or cancelled record keeps its number forever.** The number is
   never returned to the pool and never re-issued. A voided `PO-100052` stays
   `PO-100052`, marked void.
6. **A revision does not get a new number**; it gets a revision suffix on the
   same number — `Q-100347 r2`. The base number is what a customer and a
   supplier recognise.
7. **A quote that becomes an order gets a *new* job number** and keeps the
   quote number as a linked reference. `Q-100347 → J-100412`. This is the one
   place where two numbers describe the same commercial thread, and both are
   shown on the job.

### 3.3 Printavo aliases

8. **Imported Printavo records keep their `visualId` as a permanent external
   alias** on the provenance mapping (ADR-0002), not as their number.
9. **Alias search is first-class.** Typing `1234` into search must find the
   record whose Printavo alias is `1234`, forever. Staff and customers will
   quote Printavo numbers for years after cutover.
10. **Both numbers are displayed on any record that has both**, in the form
    `J-100412 · Printavo #1234`, until Terry decides otherwise (Q3).
11. **S&S purchase orders placed before cutover remain searchable by their
    Printavo number.** `getSSOrdersByPO` must accept both the alias and the
    new `PO-` number, because S&S holds whichever value was sent at the time.
    **This is a hard constraint, not a preference** — S&S's records cannot be
    rewritten.

### 3.4 Display

12. Numbers are stored and transmitted **with** the prefix and **without**
    a `#`. `J-100412`, not `#J-100412` and not `100412`.
13. Numbers are case-sensitive uppercase; input is normalised to uppercase
    before lookup so `j-100412` finds the job.
14. Six digits gives ~900,000 records per type before the width changes. At
    any plausible Americana volume this is decades. If it is ever exhausted,
    the sequence widens to seven digits and old numbers are **not** repadded.

## 4. Worked examples

| # | Scenario | Result |
|---|---|---|
| 1 | Customer requests a quote | `Q-100347` allocated at insert |
| 2 | Customer asks for a quantity change; quote re-sent | Still `Q-100347`, now revision `r2`. No new number. |
| 3 | Customer approves; job created | `J-100412` allocated; job displays `J-100412` and links `Q-100347` |
| 4 | Garments ordered from S&S for that job | `PO-100052` allocated; `poNumber: "PO-100052"` sent to S&S |
| 5 | Two staff create quotes at the same instant | `Q-100348` and `Q-100349`. No collision, order between them not guaranteed. |
| 6 | A quote insert fails after allocating a number | `Q-100350` is skipped. The next quote is `Q-100351`. **Correct behaviour.** |
| 7 | PO cancelled before the supplier ships | `PO-100052` stays, marked void. The replacement PO is `PO-100053`. |
| 8 | Goods arrive against `PO-100053` | `R-100061` allocated for the receipt |
| 9 | Partial delivery, then the rest a week later | Two receipts, `R-100061` and `R-100068`, both against `PO-100053` |
| 10 | Staff searches `1234` (a Printavo number) | Finds the imported record, displayed as `J-100288 · Printavo #1234` |
| 11 | S&S order placed pre-cutover with `poNumber: "1234"` | Still found by `getSSOrdersByPO('1234')`. Alias lookup is permanent. |
| 12 | Customer emails asking about "order 100412" | Search normalises and matches `J-100412` |

## 5. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Continue Printavo's bare-integer numbering from the last imported value** | Any gap between the import snapshot and true cutover produces a **collision with a real Printavo record** — two different documents with the same number, one of them already in a customer's inbox. Unrecoverable without renumbering. |
| **Year-prefixed numbers (`Q-2026-0001`)** | Readable, but the sequence resets annually, which means a per-year counter, an ambiguous window at midnight on Dec 31, and numbers that sort wrong as text across years. The information it carries is already in `created_at`. |
| **One shared sequence for all four types** | Cheaper to implement, but `100347` is then a quote *or* a PO *or* a receipt, and the prefix becomes the only disambiguator — so a transcription error silently addresses the wrong record type. |
| **UUIDs as the human-facing number** | Not transcribable over a phone, which is how a shop actually communicates a number to a supplier or a customer. |
| **Gap-free sequential numbers** | Requires serialised writes and a lock held for the duration of the insert. Worth paying only if an accounting or filing rule demands it — see Q2, for the bookkeeper. |
| **Reusing voided numbers** | Two documents with the same number in different states. Every audit question becomes ambiguous. |

## 6. Migration and rollback impact

- **Forward:** additive. Four sequences and a `number` column per record type;
  imported records get their Printavo number written to the provenance
  mapping, not the `number` column. **Imported records may have no native
  number at all** until they are worked on — which is fine, because the alias
  is what anyone searching for them will use.
- **Rollback:** the sequences are internal until the first number is printed
  on a customer document or sent to S&S as a `poNumber`. After that,
  `PO-100052` exists in S&S's system and this decision cannot be rolled back —
  only superseded going forward.
- **The dual-lookup requirement (rule 11) is permanent.** It does not expire
  at cutover and must not be removed as cleanup.

## 7. Open questions for the owner

| # | Question | Safe default until answered |
|---|---|---|
| **Q1** | Are `Q-` / `J-` / `PO-` / `R-` the right prefixes for how Americana talks about these records day to day? "Job" versus "Order" is a real vocabulary choice and it will appear on every document. | Use the table in §1. |
| **Q2** | Does the bookkeeper require **gap-free** numbering on any of these for filing or audit? This is the one answer that changes the implementation rather than the format. Route with `DR-002-07`. | Assume gaps are acceptable; **do not implement gap-free without an answer**, since retrofitting gaps *out* is impossible. |
| **Q3** | How long should Printavo numbers stay on customer-facing documents alongside the new number? | Show both indefinitely. Removing them later is easy; adding them back after customers have lost the thread is not. |
| **Q4** | Should a quote-to-job conversion keep one number instead of two (rule 7)? Some shops prefer `Q-100347` becoming `J-100347`. | Separate sequences, as specified. Shared numbering couples the two sequences forever. |
| **Q5** | Do store orders (EPIC-TG-035) and fundraiser orders need their own prefix, or are they jobs? | Treat as jobs. Revisit when EPIC-TG-035 is scoped. |

## 8. Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Business owner | Terry | ☐ Accepted ☐ Rejected ☐ Amended | | |
| Architecture | Scott | ☐ Reviewed | | |
| Consulted (Q2 only) | Bookkeeper | ☐ Confirmed | | |

Until this is signed, **TG-003-04 and EPIC-TG-009 remain blocked.** No agent
may choose a numbering format by inference, and in particular **no agent may
continue Printavo's integer sequence** — see the first row of §5.
