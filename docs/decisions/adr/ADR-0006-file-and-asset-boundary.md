# ADR-0006 — File and asset boundary

| Field | Value |
|---|---|
| **ADR ID** | `ADR-0006` |
| **Version** | 0.1 (draft) |
| **Status** | **Proposed — awaiting Scott's signature** |
| **Owner** | Scott (architecture) |
| **Drafted** | 2026-09-07 |
| **Effective date** | — (set on signature) |
| **Issue** | [TG-002-13 #136](https://github.com/p0wder/asp-webapp/issues/136) |
| **Depends on** | ADR-0001, ADR-0002 |
| **Related** | `DR-002-11` (link lifetime and revocation) |
| **Blocks** | EPIC-TG-007, EPIC-TG-018 |
| **Reapproval required when** | Customer-uploaded content becomes publicly shareable by design, or a second storage provider is added |

---

## Context

Artwork, proofs and uploads live in Vercel Blob today. Two properties of the
current arrangement matter:

- **`/api/upload` is public**, guarded only by an origin check — and the
  baseline records (**V5b**) that three of the four origin guards, `upload`
  among them, unconditionally allow any `http://localhost:*` origin **in
  production**, because nothing keys that branch to `NODE_ENV`.
- **Access tokens never expire.** `lib/orderStatus.js:8` states it outright:
  *"Tokens do not expire — the invoiceId itself scopes them to a single
  order."* A proof link forwarded once is a permanent credential.

Blob objects also carry no relationship to any record other than through a URL
string, so there is no way to ask "what files belong to this job?" except by
knowing the URLs already.

## Decision

**The database row is authoritative; the blob is only bytes. No customer
asset is reachable without an authorization check, and every URL that grants
access expires.**

## The contract agents must follow

1. **Every stored file has an `asset` row** — surrogate key (ADR-0002), owning
   record, kind (artwork / proof / mockup / document), content type, byte
   size, SHA-256 of the content, uploader, and created-at. **A blob without a
   row is orphaned and is deleted by the sweep; a row without a blob is a
   defect that must alert.**
2. **Private by default.** Customer artwork, proofs and documents are stored
   with private access. Public storage is reserved for genuinely public
   marketing assets (`public/`, portfolio images), and choosing it is an
   explicit, reviewed argument — never a default.
3. **Access is granted by a short-lived signed URL issued *after* an
   authorization check**, never by knowing a permanent URL. The lifetime and
   revocation rules are `DR-002-11`'s to set; this ADR only requires that a
   finite lifetime exists.
4. **The application never proxies file bytes through a route handler** when a
   signed URL will do — it wastes function time and puts customer content in
   the function's memory and logs.
5. **Uploads are validated before they are stored**: content type against an
   allow-list, byte-size ceiling, and a count/rate quota per uploader
   (TG-001-07 — the baseline's **V4** records that *no* rate limiting exists
   anywhere today, so this has no foundation yet and must be built).
6. **The content hash is the deduplication key**, not the filename. Filenames
   are user input: stored for display, never used to construct a storage path.
7. **Deletion is soft at the row and deferred at the blob.** A deleted asset's
   row is retained with `deleted_at`; the blob is removed by a sweep after a
   retention window. This preserves the epic's "do not delete evidence created
   by a failed attempt" requirement.
8. **No file path or URL encodes a customer-meaningful identifier.**
   `lib/orderAttribution.js:26` builds a Blob path from the Printavo
   `visualId`; under ADR-0002 that becomes a surrogate key, and the mapping
   lives in a row.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Keep public blob URLs, rely on unguessability** | Unguessable is not private: URLs leak through forwarding, `Referer`, browser history and support tickets. It is also the status quo for a category of content — customer artwork — that Americana does not own the rights to. |
| **Store files as `bytea` in Postgres** | Bloats the database, its backups and its restore time for content that a blob store serves better and cheaper. |
| **Move to S3** | Vercel Blob is already integrated, already paid for, and already supports private access. Switching adds a credential, a region and a failure mode for no capability gain here. |
| **Proxy every download through a route handler** | Simple and fully controlled, but every megabyte crosses a serverless function. Reserved for the cases where a signed URL genuinely cannot express the policy. |
| **A `files` JSON column on the owning record** | Repeats the Blob-JSON concurrency failure (V1) inside Postgres, and cannot be indexed, joined or swept. |

## Migration and rollback impact

- **Forward:** an `asset` table is created and backfilled from the blobs that
  exist. Backfill is read-only against Blob and reversible by dropping the
  table.
- **The one-way step** is flipping existing customer artwork from public to
  private. Any URL already sent to a customer or a supplier stops working at
  that moment. That flip must be sequenced *after* signed-URL issuance works
  end to end, and it needs a communication plan for links already in inboxes —
  which is `DR-002-11`'s scope, not this ADR's.
- **Rollback:** re-granting public access is possible but restores the
  weakness. Prefer forward-fixing the signed-URL path.

## Open questions for the owner

1. **Q1** — Retention. How long are customer artwork files kept after a job
   completes? Reorders (`DR-002-03`) depend on the prior approved artwork
   still existing, which argues for a long window. No retention period is
   documented anywhere in the repository today.
2. **Q2** — Does Americana need to *prove* which artwork file a customer
   approved (a liability question)? If so, the approved proof must be
   immutable and hash-pinned at approval time, which is a stronger requirement
   than rule 1 above.
3. **Q3** — Do supplier-facing files (a print-ready file sent to a contract
   decorator) need a different access class than customer-facing proofs?

## Sign-off

| Role | Name | Decision | Date | Reference |
|---|---|---|---|---|
| Architecture owner | Scott | ☐ Accepted ☐ Rejected ☐ Amended | | |
