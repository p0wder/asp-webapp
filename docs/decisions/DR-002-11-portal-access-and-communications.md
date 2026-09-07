# DR-002-11 — Portal access, business email identity and communication rules

| Field | Value |
|---|---|
| **Decision ID** | `DR-002-11` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Terry's signature** (Scott co-signs the link-security rules) |
| **Owner** | Terry (Americana) · co-owner: Scott (security) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-11 #134](https://github.com/p0wder/asp-webapp/issues/134) |
| **Epic** | [EPIC-TG-002 #75](https://github.com/p0wder/asp-webapp/issues/75) |
| **Depends on** | TG-001-01 (closed) · related: ADR-0006 (asset access), ADR-0007 (kill switches) |
| **Blocks** | EPIC-TG-014 (email automation), EPIC-TG-032 (customer portal), EPIC-TG-021 (proof approval) |
| **Reapproval required when** | The sending domain changes, marketing email begins, or a link type is added |

---

## 1. The decision

Four parts:

1. **Two access modes.** An authenticated Clerk session for anything durable;
   a **signed, expiring, revocable link** for one specific action by one
   specific recipient.
2. **One sending identity on an Americana-controlled domain**, with
   authenticated mail (SPF, DKIM, DMARC) and a monitored `Reply-To`.
3. **Transactional and marketing mail are separated** — different consent
   rules, different suppression behaviour, and they must never share a
   sending identity.
4. **Every failed message has a named owner.** A bounce that nobody sees is
   a customer who never heard from Americana.

## 2. Why: three findings in the current code

### 2.1 Access tokens never expire

`lib/orderStatus.js:8`, stated in the module's own docblock:

> *"Tokens do not expire — the invoiceId itself scopes them to a single
> order."*

The token is `HMAC-SHA256(invoiceId)` for status and `HMAC-SHA256("proof:" +
invoiceId)` for proofs. It is unguessable, and constant-time verified — the
cryptography is correct. But it is **a permanent bearer credential**. Forwarded
once, printed on a shared screen, or left in a browser on a shared machine, it
grants access to that order's status and proof forever. There is no
revocation: the only way to invalidate one is to rotate `STATUS_TOKEN_SECRET`,
which invalidates **every** link for **every** customer at once.

### 2.2 Customer links point at a `vercel.app` domain

`app/api/proof-upload/route.js:20`:

```js
const baseUrl = process.env.NEXTAUTH_URL || 'https://asp-webapp.vercel.app';
```

So a customer's proof link is built from `NEXTAUTH_URL` — a variable belonging
to a **decommissioned** auth system (baseline **V5**) — falling back to a
`vercel.app` hostname. Neither reads as Americana to a customer being asked to
approve artwork, and the fallback is the classic shape of a phishing link.

### 2.3 There is no email system

No `resend`, `sendgrid`, `nodemailer`, `postmark` or `mailgun` dependency
exists, and no module sends mail. Every customer email today comes from
**Printavo**. The only mail this application influences is the S&S order
confirmation, hard-coded at `lib/ssActivewear.js:370`:

```js
emailConfirmation: 'aspmerch@gmail.com,gramigscott@gmail.com',
```

— two personal/shop Gmail addresses, in source, as the operational recipients
for live supplier orders.

**This decision is therefore mostly greenfield.** That is an advantage: there
is no legacy sending reputation to protect and no existing template set to
migrate. It also means the identity choices here are the ones that will be
lived with.

## 3. Access modes

| | Authenticated session | Signed link |
|---|---|---|
| **Mechanism** | Clerk (already integrated) | HMAC token in the URL |
| **Use for** | Order history, all documents, anything a customer returns to | Exactly one action on exactly one record |
| **Lifetime** | Session policy | Per link type, §4 |
| **Revocable** | Yes — revoke the session | **Must become yes** — §4.3 |
| **Scope** | Everything that customer owns | One record, one purpose |

**Rule: a signed link may never grant more than the single action it was
issued for.** A proof-approval link opens the proof and accepts a decision. It
does not list other orders, does not expose payment history, does not become a
session. Anything broader requires sign-in.

## 4. Link policy

### 4.1 Lifetimes

| Link type | Lifetime | Rationale |
|---|---|---|
| Quote approval | **30 days**, or the quote's validity window if shorter | Aligns to the quote itself; an expired quote's link should not work |
| Proof approval | **14 days** | Proofs are time-sensitive; a stale approval is a production risk |
| Order status | **90 days from the last status change**, refreshed on each change | Customers check this repeatedly, including after delivery |
| Payment | **7 days** | Shortest window: it moves money |
| Document download | **15 minutes** | Issued at click time after an authorization check (ADR-0006) |

An expired link lands on a page that says it expired and offers to send a
fresh one to the address on file — **never** a 404, and never a silent
redirect to the home page.

### 4.2 Token contents

Tokens must carry, and the server must verify: the record id, the **purpose**
(status / proof / payment — as the current `proof:` prefix already does), an
**expiry**, and a **generation counter** read from the record. All of it is
inside the HMAC, so none of it can be edited by the holder.

### 4.3 Revocation

**Incrementing the record's generation counter invalidates every link
previously issued for that record**, without touching any other customer.
Revocation is required — automatically — when:

- the order completes (status links move to their post-delivery window);
- a proof is superseded by a new one (the old proof link dies **immediately** —
  otherwise a customer can approve a withdrawn proof, illegal move #7 in
  `DR-002-02`);
- a payment is completed or the balance changes;
- the customer's email address on the record changes;
- Terry revokes it manually.

**Rotating `STATUS_TOKEN_SECRET` remains the break-glass control** that
invalidates everything. It must stay available and must be documented as
customer-affecting.

### 4.4 What a link never does

Never authorises a *mutation of value*: no link may change an address, cancel
an order, issue a refund or alter a quantity. Approve/decline decisions are the
only writes, and each is recorded with the link that carried it.

## 5. Sending identity

| Purpose | Address | Reply-To | Monitored by |
|---|---|---|---|
| Transactional (quotes, proofs, orders, payment) | `orders@<americana-domain>` | `orders@<americana-domain>` | Sales, daily |
| Marketing (campaigns, re-orders, promotions) | `hello@<americana-domain>` | `hello@<americana-domain>` | Sales, weekly |
| Bounces and complaints | `bounces@<americana-domain>` (or the provider's) | — | **Owner** (§8) |
| Supplier order confirmations | `orders@<americana-domain>` | — | Purchasing |

`<americana-domain>` is **not recorded anywhere in this repository** and is
Q1 below. Nothing may be implemented against a placeholder.

Rules:

1. **No `noreply@`.** A customer replying to a proof email with "can you make
   the logo bigger" must reach a human. That reply *is* the change request.
2. **Never send from a personal Gmail account.** The hard-coded pair at
   `ssActivewear.js:370` moves to a role address, which also means a staffing
   change does not silently break supplier confirmations.
3. **SPF, DKIM and DMARC must all pass before the first customer send.**
   A `p=none` DMARC record is acceptable initially; `p=quarantine` follows once
   the sending pattern is stable.
4. **Transactional and marketing use separate subdomains or streams.** A
   marketing complaint must not be able to damage delivery of a proof
   approval.

## 6. Transactional versus marketing

| | Transactional | Marketing |
|---|---|---|
| **Definition** | Required to complete a transaction the customer initiated | Anything else, including "you might want to reorder" |
| **Consent** | Not required — the customer asked for the quote | **Required.** Opt-in, recorded with source and timestamp |
| **Unsubscribe link** | Not required | **Required in every message** |
| **Honours the suppression list** | **No** — except hard bounces (§8) | **Yes, always** |
| **Sending identity** | `orders@` | `hello@` |
| **Examples** | Quote sent, proof ready, payment receipt, order shipped, balance due | Seasonal promotion, "need it again?", new-service announcement |

**The boundary case, stated explicitly:** Printavo has a `feedback request` and
a `need it again` status (`app/order-status/page.jsx:30`). Under this policy
both are **marketing** — they are not required to complete anything — and both
require consent. This is the classification most likely to be got wrong,
because it feels like part of the order.

## 7. Reminder cadence

| Trigger | Schedule | Stops when | Escalation |
|---|---|---|---|
| Quote sent, no response | Day 3, day 7 | Response or expiry | Assign a follow-up task to Sales after the second |
| Proof sent, not approved | Day 2, day 5 | Decision | **Human contact** after the second. A stalled proof stalls a job. |
| Balance due, order ready | Day 1, day 4, day 8 | Paid | Owner after the third |
| Ready for pickup, not collected | Day 3, day 10, day 21 | Collected | Owner after the third. Disposal is never automatic (`DR-002-02` §7). |

Rules: **at most one automated reminder per recipient per day across all
triggers**; reminders never send outside 08:00–18:00 `America/Chicago`
(ADR-0003); a reminder chain stops permanently once a human contacts the
customer about that item.

## 8. Failures, bounces and suppression

**Owner: Terry**, for every category below. This is AC1's "failed-message
owner", and it is deliberately one named person rather than a team.

| Event | System response | Who acts |
|---|---|---|
| **Hard bounce** (address does not exist) | Suppress the address permanently; flag the contact record as unreachable; **block dependent automation** — a job must not sit waiting on a proof approval that can never arrive | Owner, daily digest |
| **Soft bounce** (mailbox full, temporary) | Retry per provider policy, up to 72h; then treat as hard | Automatic |
| **Spam complaint** | Suppress for **all** mail including transactional; flag the contact | Owner, **immediately** |
| **Marketing unsubscribe** | Suppress marketing only; transactional continues | Automatic |
| **Provider send failure** (API error) | Retry per ADR-0005; alert after the retry budget | Owner |
| **Any suppressed transactional message** | **Alert.** Suppression means a customer is not being told something they need to know — this must never be silent | Owner, immediately |

The last row is the one that matters. A suppressed *marketing* message is
correct behaviour; a suppressed *transactional* message is a job that will
quietly stall.

## 9. Reply capture scope

**Day one: replies land in a human inbox. The system does not read them.**

- `orders@` is a real, monitored mailbox.
- No parsing, no threading into the job record, no auto-response beyond an
  optional acknowledgement.
- Staff act on a reply by taking the corresponding action in the application.

Automatic reply-to-record threading is explicitly **out of scope** and belongs
to EPIC-TG-014. Recorded here so nobody builds it by inference. It is also the
feature most likely to mis-file a customer's message, which is a worse failure
than not filing it at all.

## 10. Example recipients

AC1 requires examples. Given a job for *Northside Booster Club*, contact
**Dana Reyes**, `dana@northsideboosters.example`:

| # | Event | To | From | Reply-To | Link | Consent |
|---|---|---|---|---|---|---|
| 1 | Quote `Q-100347` sent | `dana@…` | `orders@<domain>` | `orders@<domain>` | Quote approval, 30 days | Transactional |
| 2 | Proof ready | `dana@…` | `orders@<domain>` | `orders@<domain>` | Proof approval, 14 days | Transactional |
| 3 | Revised proof after changes | `dana@…` | `orders@<domain>` | `orders@<domain>` | New link; **the day-2 link is revoked immediately** | Transactional |
| 4 | Balance due | `dana@…` | `orders@<domain>` | `orders@<domain>` | Payment, 7 days | Transactional |
| 5 | Shipped, tracking | `dana@…` | `orders@<domain>` | `orders@<domain>` | Status, 90 days | Transactional |
| 6 | "Time to reorder for spring?" | `dana@…` | `hello@<domain>` | `hello@<domain>` | — | **Marketing — only if Dana opted in** |
| 7 | S&S order confirmation for `PO-100052` | `orders@<domain>` | S&S | — | — | Internal; replaces the two Gmail addresses |
| 8 | Dana's address hard-bounces at step 2 | Suppressed; Owner alerted; **the job's art gate is flagged as unreachable, not merely pending** | | | | |

## 11. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Keep non-expiring tokens (status quo)** | A permanent bearer credential in an email, with no revocation short of breaking every customer's links at once. Also blocks §4.3, without which a customer can approve a withdrawn proof. |
| **Require login for everything** | Correct security, wrong business. A booster-club treasurer approving one proof will not create an account; the approval rate falls and staff phone people instead. |
| **Signed links for everything, no accounts** | Cannot express "show me all my orders", and every link becomes a long-lived credential again. Clerk is already integrated; not using it discards paid-for capability. |
| **`noreply@` sending address** | Customers reply to proofs. That reply is the change request. Discarding it into a black hole loses real work. |
| **One address for transactional and marketing** | One spam complaint about a promotion damages the deliverability of proof approvals — a marketing annoyance becomes a production stall. |
| **Send from Gmail (status quo for supplier mail)** | Not authenticable at a domain, tied to a person rather than a role, and unusable for bulk. |
| **Parse replies into the job record on day one** | The mis-filing failure mode is worse than the manual step it saves. Deferred to EPIC-TG-014 on purpose. |

## 12. Migration and rollback impact

- **Forward, in order:** (1) acquire and authenticate the domain; (2) add
  expiry + generation to newly issued tokens while still accepting old ones;
  (3) start issuing only new-format tokens; (4) stop accepting old-format
  tokens. Steps 2–3 are invisible to customers.
- **Step 4 is the customer-visible cliff.** Every previously emailed link stops
  working. It must be scheduled deliberately — recommendation: at least 90 days
  after step 3, with the expired-link page (§4.1) live first so the failure is
  graceful rather than a 404.
- **`NEXTAUTH_URL` must be replaced** as the base-URL source before any of
  this. Baseline **V5** records that it is a leftover from a decommissioned
  auth system now load-bearing for customer links, Stripe redirect URLs and
  three origin guards. A new `PUBLIC_BASE_URL` is a prerequisite, not a
  cleanup.
- **Rollback:** email sending sits behind a kill switch (ADR-0007) —
  transactional and marketing switched **separately**, so marketing can be
  stopped without stopping proof approvals. Token-format changes roll back only
  while step 4 has not happened.

## 13. Open questions for the owner

| # | Question | Safe default until answered |
|---|---|---|
| **Q1** | **What is Americana's email domain?** Not recorded anywhere in this repository. Every address above is blocked on this. | **None. This decision cannot be implemented without it.** |
| **Q2** | Who monitors `orders@` day to day, and what response time does Americana promise? A reply-capable address nobody reads is worse than `noreply@`. | Blocked. Assign before the first send. |
| **Q3** | Are the lifetimes in §4.1 right? 14 days for a proof is short if customers are committees. | Use §4.1. Lengthening later is safe; shortening breaks live links. |
| **Q4** | Which email provider? Resend, Postmark and SES all fit; the deciding factors are bounce/complaint webhooks (§8 depends on them) and Vercel integration. | No default. Scott to recommend; any choice must support delivery webhooks. |
| **Q5** | Does Americana hold marketing consent for existing Printavo contacts, with a record of when and how it was given? If not, the marketing list starts empty at cutover. | **Assume no consent.** Migrating an unconsented list is the one genuinely hard-to-undo mistake here. |
| **Q6** | Should staff be able to send an ad-hoc message from a job, or only trigger defined templates? | Templates only at day one. |
| **Q7** | Confirm the S&S confirmation recipients (§5, row 4) — is `orders@` right, or does Purchasing need a separate address? | `orders@`. |

## 14. Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Business owner | Terry | ☐ Accepted ☐ Rejected ☐ Amended | | |
| Security / link policy (§4) | Scott | ☐ Accepted ☐ Rejected ☐ Amended | | |

**Q1 blocks implementation regardless of signature.** Until the domain is
known, EPIC-TG-014 and EPIC-TG-032 cannot start.
