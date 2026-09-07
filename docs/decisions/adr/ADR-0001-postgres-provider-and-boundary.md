# ADR-0001 — Postgres provider and data-access boundary

| Field | Value |
|---|---|
| **ADR ID** | `ADR-0001` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Scott's signature** |
| **Owner** | Scott (architecture) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-13 #136](https://github.com/p0wder/asp-webapp/issues/136) |
| **Epic** | [EPIC-TG-002 #75](https://github.com/p0wder/asp-webapp/issues/75) |
| **Blocks** | EPIC-TG-003 (all), TG-001-03, TG-001-05 |
| **Reapproval required when** | The provider changes, the deployment target stops being Vercel, or a second writer outside this application needs write access to the database |

---

## Context

`docs/baseline/TG-001-01-safety-baseline.md` §5 and variance **V1** establish
the starting point: **there is no relational database.** Persistence today is

- Vercel Blob JSON documents — whole-file read/modify/write, no transactions
  and no locking (`lib/leadsStorage.js`, `lib/promoCodesStorage.js`,
  `lib/orderAttribution.js`)
- Printavo, as the external system of record
- browser `localStorage` for the cart (`lib/cartStorage.js`)

Two of the highest-value safety controls in EPIC-TG-001 — a durable vendor
operation record with an idempotency key (TG-001-03) and deduplicated Stripe
webhook receipts (TG-001-05) — cannot be built on that. Concurrent writers to
a Blob JSON document lose records, which is exactly the failure mode
idempotency exists to prevent.

## Decision

**Use Neon serverless Postgres, provisioned through the Vercel Marketplace
integration, as the single transactional store.** All access goes through a
repository layer in `lib/db/`.

## The contract agents must follow

1. **One database, one owner.** This application is the only writer. Printavo
   remains an external system of record during dual-run; it is mirrored, never
   written to from SQL.
2. **No SQL outside `lib/db/`.** Route handlers, server components and
   `scripts/` call repository functions. This is Constitution Principle III
   (thin adapters) and Principle V (external systems behind a `lib/` client)
   applied to the database.
3. **No ORM-generated schema.** Migrations are explicit, versioned SQL
   (TG-003-03 owns the framework). The schema is a reviewed artifact, not a
   side effect of a model file.
4. **Two roles, least privilege** (TG-003-01): an application role with
   `SELECT/INSERT/UPDATE/DELETE` and no DDL, and a migration role with DDL.
   The application never runs DDL at boot.
5. **Connection handling is runtime-aware** (TG-003-02). Serverless functions
   must not hold a long-lived pool; use the pooled connection string. A module
   that opens a connection at import time is a defect.
6. **Every row that mirrors an external record carries provenance** — source
   system, source ID, fetched-at, and the payload hash it was derived from
   (TG-004-02). A mirrored row is never silently authoritative.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Keep Vercel Blob JSON** | V1: no transactions, no locking, lost updates under concurrency. It cannot express an idempotency constraint, which is the whole point of TG-001-03 and TG-001-05. |
| **Supabase** | Bundles auth and storage that duplicate Clerk and Vercel Blob, both already integrated and paid for. Adopting it invites two competing auth models — the exact failure already documented as F5 (two Clerk role sources). |
| **Vercel Postgres (as a distinct product)** | It is Neon underneath. Choosing it adds a naming indirection and no capability. |
| **Amazon RDS / self-managed Postgres** | Requires VPC, backup and patching ownership that a two-person team without a staging environment does not have. EPIC-TG-036 (backup and monitoring) would have to absorb it. |
| **SQLite / LiteFS** | Vercel functions have no durable local disk. Non-starter on the current deployment target. |

## Migration and rollback impact

- **Forward:** additive. The database is introduced alongside Blob and
  Printavo, not in place of them. No existing read path changes when the
  first migration lands.
- **Rollback:** until a domain read is switched over to Postgres, rollback is
  "stop writing to it" — no data loss, because Printavo and Blob are still
  authoritative. After a read path is switched, rollback is restoring the
  previous read path, which must therefore stay in the codebase behind a flag
  until its cutover is signed off (see ADR-0007).
- **Do not delete evidence.** A failed migration leaves its rows and its
  migration-history entry in place; the fix is a forward migration.

## Open questions for the owner

1. **Q1** — Is Neon acceptable, or is there a contractual reason to prefer
   another provider? Nothing in the repository indicates one.
2. **Q2** — Region. South Sioux City, NE is Central; `us-east-1` is the Vercel
   default. Confirm whether the latency difference matters enough to pin a
   region.
3. **Q3** — Does the bookkeeper or any third party need read access to this
   database directly, or is QuickBooks Online (EPIC-TG-033) the only
   accounting-side integration? This changes whether a read-only role is
   needed at provisioning time.

## Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Architecture owner | Scott | ☐ Accepted ☐ Rejected ☐ Amended | | |

Until this row is filled in, **TG-003-01 through TG-003-05, TG-001-03 and
TG-001-05 remain blocked.** No agent may pick a provider by inference.
