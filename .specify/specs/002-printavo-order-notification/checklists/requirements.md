# Specification Quality Checklist: Printavo Goods-In-Transit Status Notification

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-23
**Last Updated**: 2026-05-23 (post-clarification)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Clarification Session Outcomes (2026-05-23)

Four questions asked and answered. Each materially changed the spec:

1. **Quantity-reduction semantics** → Cart qty < invoice qty makes the invoice partial. Updated FR-002, FR-003, Edge Cases, Partial Items Summary entity.
2. **Persistent partial-state visibility** → Yes, derived from SS Activewear order history via PO field; new User Story 3 + FR-013, FR-014, FR-015, SC-007, SC-008.
3. **Multi-invoice attribution precision gap** → Resolve by persisting server-side attribution records at submission time; fix cart-layer dedup; forward `sourceInvoiceId` through API. New FR-016, FR-017, FR-018, FR-019, FR-020 + Order Attribution Record entity.
4. **When the Printavo status update is invoked** → Server-side chained inside `/api/place-order`; retries via separate idempotent endpoint. New FR-021, FR-022; updated FR-010.

## Notes

- Phase 1 scope is intentionally narrow on user-facing workflow (no in-app "complete the partial order" flow). But the data plumbing required to make Phase 1 *safe* — server-side attribution records, cart dedup fix, persistent partial-state derivation — is in scope and substantial. This is not optional polish; FR-002 (no false positives on auto-advance) and SC-002 (zero silent over-advance) cannot be met without it.
- The "Goods In Transit" Printavo status ID is referenced by name only. Research confirmed no sibling constant exists in the codebase today — must be sourced from Printavo admin or live introspection during planning. This is a planning-phase artifact, not a spec gap.
- Research confirmed: SS Activewear `GET /v2/orders/{identifier}?lines=true` (where identifier may be a PO number) is the expected derivation source; the existing `lib/ssActivewear.js` already has auth, base URL, and similar GET patterns wired. Caveats noted in Assumptions: `testOrder: true` is hardcoded; PO field is stamped with `#` and `, ` and must be normalized when querying.
- Research confirmed: Printavo `statusUpdate` mutation returns `OrderUnion` — same mutation as `setQuoteStatus`, expected to work for invoices with an `... on Invoice` selection. Documented in Assumptions.
- The cart-layer dedup behavior at `lib/cart.js:32-38` (keying by `sku` only) is recognized as a correctness defect, not pre-existing functionality. FR-016 explicitly requires the change.
- Items marked incomplete require spec updates before `/speckit-plan`.
