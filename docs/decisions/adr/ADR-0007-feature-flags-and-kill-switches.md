# ADR-0007 — Feature flags and kill switches

| Field | Value |
|---|---|
| **ADR ID** | `ADR-0007` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Scott's signature** |
| **Owner** | Scott (architecture) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-13 #136](https://github.com/p0wder/asp-webapp/issues/136) |
| **Depends on** | ADR-0004 |
| **Blocks** | every issue whose "Detailed requirements" say *"place authoritative-path changes behind the relevant feature flag or kill switch"* — which is all of EPIC-TG-002's dependents |
| **Reapproval required when** | A flag needs per-customer or percentage targeting, or Constitution Principle VI is amended |

---

## Context

Constitution Principle VI already fixes the hard part, and TG-001-02 already
built the reference implementation:

- `lib/ssOrderingGate.js` — the **in-code gate** (`SS_LIVE_ORDERS_CODE_GATE`)
  plus the *pure* evaluation of both gates.
- `lib/ssOrderingSwitch.js` — the **environment adapter** reading the
  fail-closed runtime switch (`SS_ORDERING_ENABLED`).
- `createSSOrder` calls `assertSSOrderingEnabled()` as its first statement,
  before credentials are read or a body is built, so a closed gate produces
  zero supplier calls.

Only the exact trimmed, case-insensitive string `"true"` opens the runtime
gate; missing, empty and unrecognised values all block, with a distinct reason
code (`CONFIG_MISSING`, `CONFIG_INVALID`, `DISABLED_BY_OWNER`,
`CODE_GATE_CLOSED`).

What is missing is the **generalisation**: every dependent issue is told to put
its change "behind the relevant feature flag or kill switch", and there is no
statement of what kind of control each situation calls for, or of the
difference between a kill switch and a rollout flag.

## Decision

**Three control types, with different rules. A kill switch is fail-closed; a
rollout flag is fail-to-old-behaviour. They are never the same variable.**

| Type | Question it answers | Failure mode | Who changes it | Lifetime |
|---|---|---|---|---|
| **Kill switch** | "Stop this real-world side effect *now*." | **Fail-closed** — block | Owner, in Vercel, no deploy | Permanent |
| **In-code gate** | "Is this path allowed to be live at all?" | Fail-closed — block | Reviewed code edit | Permanent |
| **Rollout flag** | "Is the new implementation serving this path yet?" | **Fail to the old path** | Scott, in Vercel | Temporary — removed at cutover |

## The contract agents must follow

1. **Any path that commits a real-world side effect carries both a kill switch
   and an in-code gate.** Both must be affirmatively open. Either alone stops
   the effect; neither alone permits it. This is Principle VI verbatim and is
   not negotiable by an ADR.
2. **Kill switches fail closed. Rollout flags fail to the previous
   behaviour.** Conflating them is the dangerous mistake: a rollout flag that
   fails closed takes the feature down on a config typo, and a kill switch
   that fails open places real orders on one.
3. **Evaluation is pure; reading the environment is an adapter.** Follow the
   `ssOrderingGate.js` / `ssOrderingSwitch.js` split so every flag's truth
   table is unit-testable without touching `process.env`
   (Principle IV, ADR-0004).
4. **Evaluate the gate first** — before credentials are read, a request body
   is built, or an intent row is written (ADR-0005).
5. **A closed switch never disables reads.** Status, lookup and reconciliation
   paths stay available; work already committed externally must remain
   observable. Principle VI states this explicitly.
6. **Every flag returns a machine-readable reason,** as
   `SS_ORDERING_BLOCK_REASONS` does, and the HTTP response shape stays
   constant across reasons. Operators need to know *why* it blocked; callers
   should not have to branch on it.
7. **Naming:** kill switches are `<AREA>_<VERB>_ENABLED`
   (`SS_ORDERING_ENABLED`); in-code gates are
   `<AREA>_<VERB>_CODE_GATE`; rollout flags are `ROLLOUT_<AREA>_<THING>`. The
   prefix tells a reader the failure mode without opening a file.
8. **Every flag is documented in `README.md` on the PR that introduces it** —
   name, type, owner, failure mode, and what closing it does. Adding an env
   var without updating `README.md` is already a constitution violation; this
   adds the required fields.
9. **A rollout flag has a removal ticket from the day it is created.** A
   permanent rollout flag is a permanent second code path and a permanent
   second thing to test.
10. **Changing a safety default is called out explicitly in the PR
    description** (Principle VI).

## Which control applies

| Situation | Control |
|---|---|
| Placing a live S&S / SanMar order | Kill switch **+** in-code gate |
| Charging a card, issuing a refund | Kill switch **+** in-code gate |
| Sending customer email (transactional or marketing) | Kill switch **+** in-code gate |
| Mutating a Printavo record | Kill switch **+** in-code gate |
| Reading from Postgres instead of Blob or Printavo | Rollout flag |
| Writing to Postgres *in addition to* the existing store | Rollout flag |
| Showing a new screen to staff | Rollout flag |
| A pure refactor with no behaviour change | No flag — that is what tests are for |

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **A hosted flag service (LaunchDarkly, Statsig, Vercel Flags SDK)** | Adds a network dependency in the path of a safety control. If the service is unreachable, the code must decide anyway — so the fail-closed logic has to exist regardless, and the service only adds a way for it to be wrong. Revisit only if percentage rollouts become a real need. |
| **A `feature_flags` database table** | A kill switch that depends on the database cannot stop anything during a database incident. Environment variables are readable when almost nothing else is. Rollout flags *could* live in a table; splitting the two storage mechanisms is not worth the inconsistency. |
| **One variable per feature covering both roles** | Merges two opposite failure modes into one value. This is the mistake rule 2 exists to prevent. |
| **Runtime flags only (no in-code gate)** | Explicitly forbidden by Principle VI: "Runtime flags (env vars, query params, headers) MUST NOT be the sole gate." |
| **`NODE_ENV`-based gating** | Preview deployments run with `NODE_ENV=production`, so this would arm live ordering on every branch. Note the baseline's **V5b**: three origin guards already allow localhost origins in production because nothing keys that branch to `NODE_ENV` — the inverse of the same confusion. |

## Migration and rollback impact

- **Forward:** the pattern already exists and ships. This ADR names it and
  extends it; no existing behaviour changes on acceptance.
- **Rollback:** flags *are* the rollback mechanism for most of the roadmap —
  the epic contract asks that changes be "reversible by configuration". A flag
  removed too early converts a config rollback into a code rollback.
- **Deployment note:** environment changes on Vercel require a **redeploy** to
  take effect for already-built functions. This is recorded in the kill-switch
  runbook (commit 54f9d2b) and is a property of the platform, not of the flag
  design. Any runbook written against a flag must say so.

## Open questions for the owner

1. **Q1** — The redeploy requirement means a kill switch is not truly
   instantaneous. Is that acceptable for the payment and email switches, or
   does one of them need a mechanism with no deploy latency (which would mean
   a database or edge-config read, against the reasoning above)?
2. **Q2** — Who besides Terry may flip a kill switch? Today it is "anyone with
   Vercel project access". Recommendation: keep it that way and make the
   access list the control, but confirm the list is what Terry expects.
3. **Q3** — Should closing a kill switch raise an alert (so it cannot be
   quietly left closed)? Recommendation: yes, once EPIC-TG-036 provides a
   channel.

## Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Architecture owner | Scott | ☐ Accepted ☐ Rejected ☐ Amended | | |
| Kill-switch authority | Terry (owner) | ☐ Confirmed | | |
