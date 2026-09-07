# Americana Decision Register

The versioned record of every material Terry or Scott choice, and the
architecture decisions agents must build against.

**Purpose** (EPIC-TG-002): *turn every material Terry or Scott choice into an
explicit, versioned decision before agents encode assumptions in schemas or
state machines.*

> **Everything in this register is currently `Proposed` or `Blocked`.**
> Nothing here has been signed. No agent may implement against an unsigned
> decision — see [Status meanings](#status-meanings).

---

## Index

### Business decisions (`DR-`) — Terry's, unless noted

| ID | Title | Issue | Owner | Status | Depends on |
|---|---|---|---|---|---|
| [`DR-002-01`](DR-002-01-production-statuses.md) | Americana production statuses | [#124](https://github.com/p0wder/asp-webapp/issues/124) | Terry | **Proposed** | — |
| [`DR-002-02`](DR-002-02-status-transitions.md) | Allowed status transitions and exception paths | [#125](https://github.com/p0wder/asp-webapp/issues/125) | Terry | **Proposed** | `DR-002-01` |
| [`DR-002-03`](DR-002-03-readiness-gates.md) | Required gates by order type | [#126](https://github.com/p0wder/asp-webapp/issues/126) | Terry | **Proposed** | `DR-002-01` |
| [`DR-002-04`](DR-002-04-waivers-and-reopen.md) | Owner waiver and reopen rules | [#127](https://github.com/p0wder/asp-webapp/issues/127) | Terry | **Proposed** | `DR-002-03` |
| [`DR-002-05`](DR-002-05-payment-policy.md) | Partial-payment, refund, dispute and adjustment rules | [#128](https://github.com/p0wder/asp-webapp/issues/128) | Terry | **Proposed** | ADR-0003, ADR-0005 |
| [`DR-002-06`](DR-002-06-numbering.md) | Quote, order/job, PO and receipt numbering | [#129](https://github.com/p0wder/asp-webapp/issues/129) | Terry | **Proposed** | ADR-0002 |
| [`DR-002-07`](DR-002-07-tax-authority-and-exemption.md) | Tax authority and exemption evidence policy | [#130](https://github.com/p0wder/asp-webapp/issues/130) | **Bookkeeper** | **🔒 BLOCKED** | ADR-0003 |
| [`DR-002-11`](DR-002-11-portal-access-and-communications.md) | Portal access, business email identity and communication rules | [#134](https://github.com/p0wder/asp-webapp/issues/134) | Terry + Scott | **Proposed** | ADR-0006, ADR-0007 |

### Architecture decisions (`ADR-`) — Scott's

Together these are the "core platform ADR set" of
[TG-002-13 #136](https://github.com/p0wder/asp-webapp/issues/136).

| ID | Title | Status |
|---|---|---|
| [`ADR-0001`](adr/ADR-0001-postgres-provider-and-boundary.md) | Postgres provider and data-access boundary | **Proposed** |
| [`ADR-0002`](adr/ADR-0002-identifiers.md) | Identifier types | **Proposed** |
| [`ADR-0003`](adr/ADR-0003-money-and-time.md) | Money and time representation | **Proposed** |
| [`ADR-0004`](adr/ADR-0004-service-and-repository-composition.md) | Service and repository composition | **Proposed** |
| [`ADR-0005`](adr/ADR-0005-transaction-and-outbox.md) | Transaction boundary and outbox | **Proposed** |
| [`ADR-0006`](adr/ADR-0006-file-and-asset-boundary.md) | File and asset boundary | **Proposed** |
| [`ADR-0007`](adr/ADR-0007-feature-flags-and-kill-switches.md) | Feature flags and kill switches | **Proposed** |

### Not yet drafted

Remaining EPIC-TG-002 issues, outside this track:

| ID | Title | Issue |
|---|---|---|
| `DR-002-08` | Cutover document and report minimum set | [#131](https://github.com/p0wder/asp-webapp/issues/131) |
| `DR-002-09` | Detailed history depth and archive format | [#132](https://github.com/p0wder/asp-webapp/issues/132) |
| `DR-002-10` | Native online stores vs. Printavo cancellation — marked RESOLVED in the issue title; needs a record here | [#133](https://github.com/p0wder/asp-webapp/issues/133) |
| `DR-002-12` | SanMar day-one scope and controlled manual bridge | [#135](https://github.com/p0wder/asp-webapp/issues/135) — blocked on TG-028-01 |

---

## Status meanings

| Status | Meaning | What agents may do |
|---|---|---|
| **Proposed** | Drafted, recommendation stated, **not signed** | **Nothing.** Read it to understand the intent; implement none of it. |
| **🔒 Blocked** | Cannot be decided yet — an external input is missing | Nothing. The safe default in the document holds. |
| **Accepted** | Signed by the named owner, with a date | Implement exactly this. Cite the ID and version. |
| **Superseded** | Replaced by a later version or a different decision | Do not implement. Follow the link forward. |

**The load-bearing rule:** *no agent is asked to infer an unresolved business
rule* (EPIC-TG-002 acceptance criteria). If a decision is `Proposed` or
`Blocked` and your ticket needs it, **your ticket is blocked** — say so and
stop. Do not pick the recommendation because it looks reasonable.

## Signing a decision

1. The named owner reviews the document and answers its **Open questions**
   section. Answers are written into the document, not left in chat or email.
2. The owner fills in the **Sign-off** table: decision, date, and a reference
   (an email, a meeting date, a comment link).
3. Status → `Accepted`, version → `1.0`, effective date set.
4. The change lands as a PR that also updates this index. The Git history
   **is** the audit trail — who signed what, when, and what the text said at
   that moment.
5. Any issue blocked on that decision is unblocked in GitHub, with a comment
   citing the decision ID **and version**.

## Versioning

Same scheme as `.specify/memory/constitution.md`:

- **MAJOR** — the rule is reversed or a signed commitment is withdrawn.
- **MINOR** — a new rule is added, or an existing one materially expanded.
- **PATCH** — wording, examples, typos. No behavioural change.

Drafts are `0.x`. The first signature is `1.0`.

## Amending an accepted decision

**Never edit an accepted decision in place.** Its text is what somebody
signed.

- **Small correction, no behaviour change** — PATCH bump, with a note in the
  document saying what changed and why.
- **Anything else** — a new version, with the previous text retained below a
  `--- superseded ---` marker (the constitution's Sync Impact Report is the
  model), or a new decision that supersedes it. **Both documents link to each
  other.** Superseded decisions are never deleted: an invoice sent last
  quarter was produced under last quarter's rules.

## Reapproval conditions

Every document carries a **"Reapproval required when"** row. When one of those
conditions occurs, the decision returns to `Proposed` until re-signed — it does
not quietly continue to apply.

## Owners

| Owner | Decides |
|---|---|
| **Terry** | Business policy: statuses, transitions, gates, waivers, payment terms, numbering, communications |
| **Scott** | Architecture: the ADR set, and link-security rules in `DR-002-11` |
| **Bookkeeper** | Tax authority and exemption evidence (`DR-002-07`) — Terry cannot sign this one |

## Conventions

- **`DR-002-NN` matches the ticket's stable ID.** The backlog says *"Stable ID
  preserved; do not renumber"*; the register follows.
- **ADRs are numbered independently** (`ADR-0001`…) because they outlive the
  epic that prompted them.
- **Documents contain no credentials and no customer data.** The example
  contact in `DR-002-11` §10 is fictional and uses an `.example` domain.
- **Every factual claim about current behaviour cites `file:line`.** If a
  citation and the code disagree, the code is right and the document needs a
  PATCH.

## Related

- [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) —
  engineering principles. The constitution governs *how code is written*; this
  register governs *what the business rules are*. Where an ADR states a rule
  agents must follow permanently, it should be folded into the constitution
  once accepted (see ADR-0004 Q2).
- [`docs/baseline/TG-001-01-safety-baseline.md`](../baseline/TG-001-01-safety-baseline.md)
  — the Phase 0 audit. Every "what the code does today" section here cites it
  or the code directly.

---

<sub>Scope note: these documents are decision records only — Track A, no
application code. The `T1`/`T2` testing requirements on the source issues
(unit test for the rule, integration test for its boundary) attach to the
**implementing** issues, since a decision record has no code boundary to test.
Each document names the issues that inherit them.</sub>
