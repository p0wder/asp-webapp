# ADR-0004 — Service and repository composition

| Field | Value |
|---|---|
| **ADR ID** | `ADR-0004` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Scott's signature** |
| **Owner** | Scott (architecture) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-13 #136](https://github.com/p0wder/asp-webapp/issues/136) |
| **Depends on** | ADR-0001, ADR-0002 |
| **Blocks** | EPIC-TG-004 (all) |
| **Reapproval required when** | A second delivery mechanism (a queue worker, a public API) needs to call domain logic |

---

## Context

The constitution already fixes most of this: Principle III (routes are thin
adapters), Principle IV (pure logic separated from I/O), Principle V (external
APIs behind a `lib/` client). Compliance is good but not total — the baseline
records **V9**, a Printavo GraphQL mutation written inline in
`app/api/stripe-webhook/route.js:44-51`, the only external mutation in the
repository outside a `lib/` client and therefore outside the audit-logging
convention.

What the constitution does *not* yet fix is the layer between a route and an
API client: where a business rule lives once it needs both the database and a
supplier. `lib/placeOrderChain.js` is that layer today, and it reaches
directly for `lib/printavo.js` and `lib/ssActivewear.js`, so there is no seam
at which either can be substituted in a test.

## Decision

**Three layers, one composition root, dependencies passed in.**

```
app/api/**/route.js      adapter    — auth, validate, delegate, respond
lib/domain/*.js          service    — business rules; depends on interfaces only
lib/db/*.js              repository — SQL; the only place SQL exists
lib/*.js                 adapter    — Printavo, S&S, Stripe, Blob, Clerk clients
lib/composition.js       root       — the only module that wires concrete to abstract
```

## The contract agents must follow

1. **A domain service never imports a concrete adapter.** It receives
   repositories and ports as arguments. `import { createSSOrder } from
   '@/lib/ssActivewear'` inside `lib/domain/` is a violation.
2. **A repository returns domain values, not database rows.** Column names,
   `snake_case` and driver types stop at the repository boundary.
3. **A repository never calls another repository, and never calls a service.**
   Composition happens above it.
4. **Only `lib/composition.js` constructs concrete implementations.** A route
   asks the composition root for a service; it does not `new` anything itself.
   This is what makes an in-memory repository possible in tests without a
   database.
5. **Pure logic stays pure.** `lib/cart.js` vs `lib/cartStorage.js` and
   `lib/ssOrderingGate.js` vs `lib/ssOrderingSwitch.js` are the two canonical
   pairs in the repository; new rules follow them. The gate pair matters
   especially: because the *evaluation* is pure, the kill switch is testable
   without touching the environment.
6. **External mutations are logged at the adapter, not the service**
   (Principle V), and redaction is the adapter's job (TG-001-08).
7. **The inline mutation at `stripe-webhook/route.js:44-51` moves into
   `lib/printavo.js`** as part of whichever issue lands first — it is the one
   known standing violation of this ADR.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Keep logic in route handlers** | Already rejected by Principle III. `/api/submit-quote` at 293 lines is the cautionary example the baseline names. |
| **Active Record (models with their own persistence)** | Couples every rule to the database and makes a "what would this do?" test require a database. Also drags in an ORM, against ADR-0001. |
| **A DI container / decorator framework** | Solves an ownership problem this team does not have, at the cost of a framework nobody here has operated. A single composition module is ~50 lines. |
| **Import-time singletons (`export const orderService = new OrderService(db)`)** | Opens a database connection at import, which ADR-0001 forbids in a serverless runtime, and makes substitution in tests a module-mocking exercise. |
| **Skipping the service layer; repositories called from routes** | Works until one rule needs two repositories and a supplier call in one transaction — which is `placeOrderChain` today. That is precisely the case that needs a home. |

## Migration and rollback impact

- **Forward:** incremental and non-breaking. `lib/` keeps its current shape;
  `lib/domain/` and `lib/db/` are new directories. Existing modules move one
  at a time, each move a mechanical, reviewable diff.
- **Rollback:** a service can delegate to the old module during transition, so
  reverting one migration step does not revert the layer.
- **No migration risk to data** — this ADR concerns code organisation only.

## Open questions for the owner

1. **Q1** — `lib/domain/` versus a top-level `domain/`. The constitution's file
   organisation section lists `lib/` as "external API clients, pure logic,
   pricing math", so `lib/domain/` fits without amending it; a top-level
   directory would require a constitution PR. Recommendation: `lib/domain/`.
2. **Q2** — Should this ADR be folded into the constitution as a principle
   once accepted? It is a rule agents must follow, and the constitution is
   where agents are told to look. Recommendation: yes, as a MINOR amendment,
   in the PR that lands TG-004-01.

## Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Architecture owner | Scott | ☐ Accepted ☐ Rejected ☐ Amended | | |
