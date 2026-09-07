# ADR-0002 — Identifier types

| Field | Value |
|---|---|
| **ADR ID** | `ADR-0002` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Scott's signature** |
| **Owner** | Scott (architecture) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-13 #136](https://github.com/p0wder/asp-webapp/issues/136) |
| **Depends on** | ADR-0001 |
| **Related** | `DR-002-06` (human-readable numbering) — this ADR covers *machine* identity only |
| **Blocks** | TG-003-04, TG-004-02 |
| **Reapproval required when** | An identifier must become externally guessable-safe in a new context, or a second writer starts inserting rows |

---

## Context

Identity in the codebase today is entirely external. Records are addressed by
Printavo node IDs and by `visualId` — the human-facing Printavo number — which
is also reused as the purchase-order number sent to S&S
(`lib/ssActivewear.js:590` `getSSOrdersByPO`). Vercel Blob "records" are
addressed by a URL-encoded `visualId` in a path
(`lib/orderAttribution.js:26`).

That means a single external number carries three jobs at once: primary key,
customer-facing label and supplier cross-reference. At cutover it stops being
issued, and every one of those three jobs breaks at the same moment.

## Decision

**Separate the three concerns into three distinct identifier kinds.**

| Kind | Type | Example | Exposed to |
|---|---|---|---|
| **Surrogate key** | `uuid` (UUIDv7) | `0192f3c1-…` | Internal, and in URLs where a stable opaque handle is needed |
| **Business number** | `text`, unique per record type | `J-100001` | Customers, staff, documents — see `DR-002-06` |
| **External reference** | `(system, external_id)` pair on a provenance table | `('printavo','1234')` | Reconciliation and search only |

## The contract agents must follow

1. **Every table's primary key is a UUIDv7 `uuid` column named `id`.** No
   exceptions, including join tables.
2. **UUIDv7, not v4.** v7 is time-ordered, so index locality and B-tree page
   splits behave like a sequential key while remaining non-guessable.
   Generation happens in the application (TG-003-04 owns the helper), so a
   record has its identity before it is inserted — which is what makes an
   idempotency key computable before the external call (TG-001-03).
3. **A surrogate key is never rendered as the thing a human reads.** Documents,
   emails and screens show the business number.
4. **A business number is never a foreign key.** Foreign keys reference `id`.
5. **External IDs are never primary keys and never unique on the domain
   table.** They live on the provenance/mapping table so one domain record can
   carry several external identities (a Printavo quote ID *and* the invoice ID
   it became, *and* an S&S order number).
6. **No identifier is ever reused,** including after a delete or a void.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **`bigserial` primary keys** | Sequential integers leak business volume when exposed and make an enumeration bug into a data-disclosure bug. They also cannot be generated before insert, which defeats pre-call idempotency keys. |
| **UUIDv4** | Random keys scatter B-tree inserts. At this data volume the cost is small, but v7 costs nothing to adopt now and cannot be retrofitted cheaply. |
| **Printavo `visualId` as the primary key** | It is issued by a system being decommissioned, it is not unique across quotes and invoices, and it is already overloaded as a supplier PO number. This is the status quo and it is what forces the cutover cliff. |
| **ULID / KSUID as strings** | Same ordering property as UUIDv7 but as `text`, giving up native `uuid` storage, indexing and type checking in Postgres for no gain. |
| **Composite natural keys** | Every candidate natural key here (customer + date, style + color) turns out to be mutable. |

## Migration and rollback impact

- **Forward:** additive. Importing Printavo records (EPIC-TG-009) assigns each
  a fresh UUIDv7 and writes the Printavo ID to the provenance table. Nothing
  external changes.
- **Rollback:** no external effect — surrogate keys are not published to any
  outside system, so abandoning the schema abandons the keys with it.
- **The one irreversible moment** is the first time a surrogate key appears in
  a customer-visible URL. Before that, key choice is a private decision; after
  it, links live in inboxes forever. Deferring surrogate keys into URLs until
  `DR-002-11` (link policy) is signed keeps that reversible.

## Open questions for the owner

1. **Q1** — Should customer-facing URLs use the surrogate key or the business
   number? The business number is friendlier and already leaked to customers on
   documents; the surrogate key is unguessable. Recommendation: surrogate key
   in URLs, business number in the page body. Ties directly to `DR-002-11`.
2. **Q2** — UUIDv7 generation needs a library or ~20 lines of code. The
   constitution's YAGNI rule ("do not add a library to solve a problem that one
   to three lines already solves") suggests writing it; a spec-conformant v7
   is nearer 25 lines. Confirm which way to go.

## Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Architecture owner | Scott | ☐ Accepted ☐ Rejected ☐ Amended | | |
