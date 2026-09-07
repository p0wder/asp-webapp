# DR-002-07 — Tax authority and exemption evidence policy

| Field | Value |
|---|---|
| **Decision ID** | `DR-002-07` |
| **Version** | 0.1 (draft) |
| **Status** | **BLOCKED — awaiting the bookkeeper.** This document is a decision *request*, not a decision. |
| **Owner** | **Bookkeeper** (decision authority) · Terry (accepts commercially) · Scott (implements) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — |
| **Issue** | [TG-002-07 #130](https://github.com/p0wder/asp-webapp/issues/130) |
| **Epic** | [EPIC-TG-002 #75](https://github.com/p0wder/asp-webapp/issues/75) |
| **Depends on** | TG-001-01 (closed) · ADR-0003 (money and rounding) |
| **Blocks** | EPIC-TG-016 (pricing engine), EPIC-TG-031 (payment ledger), EPIC-TG-033 (QuickBooks) |
| **Reapproval required when** | Rates change, nexus changes, a new state is shipped to, or the exemption-certificate rules change |

---

## ⚠️ Why this one is different

Every other decision in EPIC-TG-002 is an Americana business choice: Terry or
Scott can decide it, and a wrong answer costs rework. **This one is a tax
compliance question, and a wrong answer costs money to a tax authority.**

Nothing in this document is a tax determination. The recommendations below are
*drafting suggestions for the bookkeeper to correct or confirm* — they exist so
the bookkeeper is answering specific questions rather than an open-ended
"how should tax work?".

**No agent may implement tax logic from this document in its current state.**
The safe default in §4 is what holds until the bookkeeper signs.

## 1. What the code does today

`app/quote/page.jsx:210`:

```js
const salesTax = discountedSubtotal * 0.075;
```

labelled at `:403` and again at `:766` as:

> `Est. sales tax (7.5%)`

Six properties of that line, each of which the bookkeeper should know:

1. **The rate is hard-coded** at 7.5%. No jurisdiction lookup, no rate table,
   no effective date. There is no record of where 7.5% came from.
2. **It is computed in the browser**, in a Client Component. It is a display
   estimate; nothing server-side derives, stores or validates it.
3. **It is floating-point** — the exact pattern ADR-0003 retires.
4. **It applies to the full discounted subtotal**, with no distinction between
   garments, decoration labour, setup fees or freight. Whether those are
   taxed alike is Q4.
5. **There is no exemption path at all.** No customer can be marked exempt, no
   certificate can be stored, and the quote form has no field for one. A
   school or church quoting through the website is quoted tax.
6. **It never reaches an invoice or a charge.** The authoritative tax figure
   today comes from **Printavo**, and the Stripe charge amount is whatever the
   client posts (`app/api/create-payment-session/route.js:13` — baseline
   finding **F3**). So the quoted estimate and the collected amount are
   related only by convention.

Point 6 is the reason this is a P1 rather than a P0: **the estimate is
currently non-binding**, and that is what makes the safe default in §4 viable.

## 2. What must be decided

The ticket's AC1 requires the policy to name five things. Each is a question
here:

| | Required by AC1 | Status |
|---|---|---|
| **A** | The tax **authority** | Unknown — Q1, Q2 |
| **B** | The **effective-time** rule | Unknown — Q6 |
| **C** | **Rounding** | Recommendation in ADR-0003 §Money rule 3–4; needs confirmation — Q7 |
| **D** | **Exemption evidence** | Unknown — Q8–Q11 |
| **E** | The **mismatch owner** | Recommendation: the bookkeeper — Q12 |

## 3. Questions for the bookkeeper

### Nexus and authority

- **Q1 — Which jurisdictions must Americana collect for?** The shop is in
  South Sioux City, Nebraska, which sits at the Nebraska / Iowa / South Dakota
  tri-state line. Customers a few minutes away are in a different state.
  Please confirm: Nebraska state and local only, or does Americana have a
  collection obligation in Iowa and/or South Dakota?
- **Q2 — Is the applicable rate sourced by destination or by origin,** and
  does that differ between a pickup at the shop and a shipment to the
  customer?
- **Q3 — Where does the rate come from operationally?** Options, cheapest
  first:
  - a **maintained rate table** in this system, with effective dates
    (viable if Q1 is a small, stable set of jurisdictions);
  - a **tax service** (Avalara, TaxJar) called at quote and invoice time;
  - **QuickBooks Online** as the authority, with this system displaying an
    estimate only (relates to EPIC-TG-033).

### What is taxable

- **Q4 — Which components are taxable?** Please mark each:
  garments · decoration labour (printing, embroidery) · screen/setup fees ·
  art charges · rush fees · **freight and delivery** · **decoration applied to
  customer-supplied garments** (a service on goods Americana never sold —
  frequently treated differently, and Americana does take these jobs, see
  `DR-002-03` §5.1).
- **Q5 — Do discounts and promo codes reduce the taxable base?** The code
  currently taxes the *discounted* subtotal (`:210`).

### Timing and arithmetic

- **Q6 — Which date fixes the rate**: quote date, order/acceptance date,
  invoice date, or ship date? This matters because a quote can be valid for
  30 days (`DR-002-11` §4.1) across a rate change.
- **Q7 — Rounding.** ADR-0003 proposes half-up at the line, summed to the
  document total. Is per-line or per-invoice rounding required for filing?
  Confirm half-up is acceptable.

### Exemptions

- **Q8 — Who can be exempt?** Schools, churches, non-profits, government,
  resale (another printer buying from Americana), other.
- **Q9 — What evidence is required and retained?** For Nebraska this is
  commonly a state resale/exempt sale certificate — **the bookkeeper to
  confirm the correct current form and its official name**; this document
  deliberately does not assert one.
- **Q10 — Does a certificate expire or need periodic renewal,** and if so on
  what schedule? The system must be able to hold an expiry and block on it.
- **Q11 — Who may accept a certificate and mark a customer exempt?**
  Recommendation: the bookkeeper only, never sales staff, never self-service.
  Confirm.

### Reconciliation

- **Q12 — Who owns a quoted-vs-invoiced-vs-filed mismatch,** and how quickly
  must it be resolved? Recommendation: the bookkeeper owns it, reviewed
  monthly before filing.
- **Q13 — Is Americana's own purchasing exempt?** Americana buys garments from
  S&S for resale, which usually means a resale certificate on file with the
  supplier. Confirm this exists and is current — it affects landed cost, and
  therefore pricing.

## 4. The safe default in force until this is signed

Per the epic exit gate — *"unresolved items have an explicit safe default and
remain blocked where that default is not authorized"* — the following holds
now and requires no signature:

1. **The quoted tax figure stays a clearly labelled, non-binding estimate.**
   The existing "Est. sales tax (7.5%)" wording is retained *as an estimate*
   and must not be presented as a determination.
2. **No tax figure computed by this application is authoritative.** Invoices
   and charges take tax from Printavo — and after cutover, from whatever Q3
   names — never from `app/quote/page.jsx`.
3. **No exemption may be applied by this system.** There is no mechanism
   today, and adding one without Q8–Q11 answered would create records that
   look like evidence and are not.
4. **The estimate must not be used to derive a Stripe charge amount.** This
   is independent of tax policy — TG-001-04 requires the charge to derive from
   the server-owned balance regardless (finding **F3**).
5. **The float arithmetic at `:210` may be corrected to integer cents under
   ADR-0003 without waiting for this decision**, because rounding an estimate
   correctly changes nothing about tax policy. That fix is unblocked.

**What is blocked:** any tax *table*, any rate lookup, any exemption flag, any
tax field on a persisted invoice, and any QuickBooks tax mapping.

## 5. A recommended shape, for the bookkeeper to correct

Offered so the bookkeeper can react to something concrete. **None of it is
adopted.**

- Tax is computed **server-side only**, in `lib/domain/`, never in a component.
- A `tax_rate` table with `(jurisdiction, rate, effective_from, effective_to,
  source)` — rates are versioned, never edited in place, so a historical
  invoice always recomputes to what it charged.
- Each invoice stores its **computed tax amount in cents, the rate applied,
  the rate row id, and the jurisdiction** — the tax is a recorded fact, not a
  formula re-run at read time.
- Exemption lives on the **customer**, with: type, certificate asset reference
  (ADR-0006), issue date, expiry, who accepted it, when. An expired
  certificate **fails closed** — the customer is taxed until it is renewed.
- Every line carries a **taxability class** (garment / labour / freight /
  fee), so Q4 is answered per line rather than per invoice.
- Quote and invoice tax are computed by the **same** function. A divergence
  between them is then a data difference, never a code difference.

## 6. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Keep the hard-coded 7.5% and make it authoritative** | Nobody can say where the number came from, it has no effective date, and it cannot express an exemption. Making an undocumented constant authoritative is how an assessment happens. |
| **Guess a rate table from public data and ship it** | This is exactly the "no agent is asked to infer an unresolved business rule" case in the epic's acceptance criteria. Publicly available rates are not a substitute for the bookkeeper telling us which jurisdictions Americana collects for. |
| **Adopt a tax service now and decide policy later** | A service still has to be told nexus, product taxability and exemption handling. It answers *how*, never *whether*. |
| **Let QuickBooks own tax entirely and show nothing on quotes** | Cleanest compliance story, but customers need a total before they approve a quote. Worth keeping on the table as a genuine option — it is Q3's third choice. |
| **Let sales staff mark a customer exempt** | Creates a record that looks like evidence with no certificate behind it. Worse than having no exemption feature. |

## 7. Migration and rollback impact

- **Forward:** additive. A rate table and exemption records are new; nothing
  recomputes historical tax. **Historical invoices keep the tax they charged**
  — a stored amount, never a re-derivation.
- **Rollback:** while the estimate stays non-binding (§4), rollback is free.
  After the first invoice with a system-computed tax figure reaches a
  customer, rollback is a **credit note**, not a code revert.
- **The irreversible moment is the first live tax-bearing invoice.** ADR-0003
  makes the same point about rounding: this decision must be signed before
  that invoice, or the tax line must remain non-binding until it is.

## 8. Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| **Tax authority (decides)** | Bookkeeper | ☐ Accepted ☐ Amended | | |
| Business owner (accepts) | Terry | ☐ Accepted | | |
| Architecture (implements) | Scott | ☐ Reviewed | | |

**Status stays BLOCKED until the bookkeeper's row is filled in.** The
recommendations in §5 carry no authority. Q1, Q4, Q8 and Q9 are the four
answers without which nothing here can be built.
