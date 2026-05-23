# Quickstart: Printavo Goods-In-Transit Status Notification

**Date**: 2026-05-23

Manual validation flow for the feature. This project has no automated test framework (per the constitution's YAGNI principle); the quickstart is the validation contract. Run through every section before considering the feature complete.

---

## Prerequisites

1. **Env vars** (all already in use elsewhere in this repo):
   - `SS_ACTIVEWEAR_USERNAME`, `SS_ACTIVEWEAR_PASSWORD`, `SS_ACTIVEWEAR_ACCOUNT_EMAIL`
   - `PRINTAVO_API_EMAIL`, `PRINTAVO_API_TOKEN`
   - `BLOB_READ_WRITE_TOKEN` (for `@vercel/blob` — already required by `app/api/upload/route.js`)
   - `NEXTAUTH_SECRET`, `ADMIN_USERS`
2. **Printavo status ID for "Goods In Transit"** filled in at `lib/printavo.js` (Phase 0 research §3).
3. **`testOrder: true` in `lib/ssActivewear.js:335`** stays `true` for the duration of manual testing (per Constitution Principle VI).

---

## Setup (one-time)

```bash
npm install
npm run dev
```

Open http://localhost:3000/orders and sign in as an admin.

---

## Section 1 — Fully ordered invoice → auto-advance (User Story 1)

**Goal**: Verify FR-001 / FR-002 / FR-004 / SC-001.

1. On the orders page, pick a "Ready to Order" invoice whose every line item resolves to an SS Activewear catalog match (no Sanmar items, no failed lookups).
2. Click "Add to Cart" on **every** line item, leaving cart quantities at their default (= invoice qty).
3. Navigate to checkout. Verify the PO number reads `#<visualId>`.
4. Click "Submit Order" — **note the wall-clock time at click**.
5. **Expected on confirmation screen**:
   - "Updating Printavo…" indicator briefly visible for the invoice.
   - "Status updated to Goods In Transit" message tied to the invoice.
   - SS Activewear order details (orderNum, invoiceNumber) present.
   - **SC-001 timing observation**: note elapsed time from Submit click to the status chip resolving to "Status updated to Goods In Transit". If > 10s, record as a failure of SC-001 (95% of attempts must complete within 10s).
6. **Verify in Printavo admin UI**: the invoice now reads "Goods In Transit".
7. **Verify Vercel Blob (browser DevTools → Network or via `vercel blob list` CLI)**: a new blob exists at `ss-order-attribution/<orderRef>.json` containing the submitted lines with `sourceInvoiceId`, `sourceInvoiceVisualId`, `sourceLineItemId`. The per-invoice index at `ss-order-attribution/by-invoice/<visualId>.json` lists the new `orderRef`.

✅ Pass condition: All six expected outcomes observed.

---

## Section 2 — Partial invoice: Sanmar items present (User Story 2)

**Goal**: Verify FR-003 / FR-005 / FR-008 / FR-009.

1. Pick a "Ready to Order" invoice with at least one Sanmar line item (look for the "Sanmar – Auto Order" badge).
2. Add ALL SS Activewear line items from this invoice to the cart at default quantities. Do NOT add Sanmar items (you can't anyway).
3. Submit the order.
4. **Expected on confirmation screen**:
   - The invoice appears under "Partial — needs follow-up".
   - Listed: the items that were submitted (SS) and the items still needing follow-up (Sanmar, with "source: Sanmar (auto-order)").
   - **No** "Status updated" message for this invoice.
5. **Verify in Printavo**: the invoice's status is **unchanged** (still "Ready to Order").

✅ Pass condition: All four expected outcomes observed.

---

## Section 3 — Partial invoice: under-quantity (Clarification Q1)

**Goal**: Verify the post-clarification quantity-reduction → partial rule (FR-003).

1. Pick a fully SS Activewear invoice (no Sanmar items).
2. Add every line item to the cart, but **reduce the quantity of one line item** below the invoice's requested qty.
3. Submit.
4. **Expected on confirmation screen**:
   - Invoice classified as **partial** (not fully-ordered) because of the qty shortfall.
   - The reduced line item is enumerated under "still needs follow-up" with `cartQty` and `stillNeeded` (invoice qty − cart qty).
5. **Verify in Printavo**: the invoice's status is unchanged.

✅ Pass condition: All three expected outcomes observed.

---

## Section 4 — Persistent partial badge on orders page (User Story 3)

**Goal**: Verify FR-013 / FR-014 / SC-007.

1. After completing Section 3 above (which left invoice partially ordered), **close the browser tab** and **clear localStorage** (Application → Storage → Clear site data in DevTools).
2. Reopen http://localhost:3000/orders.
3. **Expected**: The invoice from Section 3 (still in "Ready to Order") now displays a partial badge: "Partial — N items still need ordering".
4. Click the badge to expand the drill-down — **note the wall-clock time at click**.
5. **Expected**: A per-line-item table with `description`, `alreadyOrdered` (cart qty from Section 3), `stillNeeded` (the shortfall), and `source`. Sanmar items (if any from Section 2) appear with `alreadyOrdered: 0` and source labeled.
6. **SC-008 timing observation**: note elapsed time from badge click to drill-down render. If > 3s, record as a failure of SC-008 (95% of attempts must complete within 3s).

✅ Pass condition: Badge visible after cache/cookies clear; drill-down accurate; both timing observations within budget.

---

## Section 5 — Multi-invoice attribution: same SKU across invoices (Clarification Q3)

**Goal**: Verify FR-016 (cart dedup), FR-017 (API forwards attribution), FR-018 (record stored), FR-019 (lossless derivation).

1. Find two "Ready to Order" invoices that share at least one common SKU (e.g., both request Gildan G500 Black L). Different quantities preferred.
2. Open invoice A, "Add to Cart" the shared SKU at the invoice's requested qty.
3. Navigate to invoice B, "Add to Cart" the same shared SKU at invoice B's requested qty.
4. Open the cart. **Expected**: TWO separate cart rows for the shared SKU (one per source invoice), not a single merged row. Each row shows the source invoice's visualId.
5. Submit the order.
6. **Expected response (visible via DevTools → Network)**: the request body includes `sourceInvoiceId` + `sourceLineItemId` on every line.
7. **Expected on confirmation screen**: both invoices are classified independently — both should show "fully ordered" if all their lines were submitted, OR partial if any line was missing.
8. **Verify the blob**: the new attribution record has separate `lines[]` entries for the same SKU with distinct `sourceInvoiceId`s.
9. Return to the orders page. **Expected**: Neither invoice shows a partial badge (both fully covered).

✅ Pass condition: Cart shows two rows; submission preserves attribution end-to-end; orders page reflects accurate state.

---

## Section 6 — Printavo status update failure → retry (User Story 4)

**Goal**: Verify FR-010 retry endpoint + idempotency.

1. Temporarily break the Printavo status update by setting `GOODS_IN_TRANSIT_STATUS_ID` to an invalid value (e.g., `'000000'`) in `lib/printavo.js`. Restart `npm run dev`.
2. Repeat Section 1 (submit a fully-ordered invoice).
3. **Expected on confirmation screen**: SS order success shown; status update for the invoice shows "Status update failed — Retry" with the Printavo error.
4. **Verify in Printavo**: invoice is still "Ready to Order".
5. **Revert the status ID** in `lib/printavo.js` to the correct value. Restart dev. (The SS order has already been placed — that's fine, it's a test order.)
6. Click the "Retry" button on the confirmation screen (you may need to keep the screen open; alternatively, navigate to the orders page and click the partial badge → there's no retry there, this is just for the confirmation screen).
7. **Expected response**: 200 with `skipped: false`, `previousStatus: Ready to Order`, `newStatus: Goods In Transit`.
8. **Verify in Printavo**: invoice now reads "Goods In Transit".
9. Click "Retry" again immediately. **Expected**: 200 with `skipped: true, reason: 'already-in-or-past-target'`. No double-update.

✅ Pass condition: First retry succeeds; second retry is an idempotent no-op.

---

## Section 7 — Edge: invoice moved out of "Ready to Order" mid-flight (FR-006)

**Goal**: Verify FR-006 (no overwrite of non-Ready-to-Order statuses) + SC-006.

1. Pick a fully-SS-Activewear invoice; add all items to the cart at default qty.
2. **Before clicking Submit**, open Printavo admin in another tab and manually change the invoice's status to e.g. "Production" or any other status that's NOT "Ready to Order".
3. Return to the checkout tab and click "Submit Order".
4. **Expected on confirmation screen**: The invoice appears with `statusUpdate.outcome: 'skipped'`, `reason: 'skipped-not-ready'`. No Printavo error.
5. **Verify in Printavo**: status remains as you set it manually — NOT overwritten.

✅ Pass condition: No silent overwrite.

---

## Section 8 — Edge: SS Activewear failure (FR-007)

**Goal**: Verify no Printavo updates or attribution writes happen on SS failure.

1. Temporarily break SS by setting `SS_ACTIVEWEAR_PASSWORD` to a wrong value in `.env.local`. Restart.
2. Submit any order.
3. **Expected**: 500 response with `error` from `createSSOrder`. Confirmation screen surfaces the error and preserves the cart.
4. **Verify in Printavo**: no status changes occurred.
5. **Verify Vercel Blob**: no new attribution record was written.
6. Revert the env var. Restart.

✅ Pass condition: All three "no" outcomes confirmed.

---

## Section 9 — Edge: orders page partial-state degradation (FR-015)

**Goal**: Verify graceful unavailable state when SS history lookup fails.

1. Temporarily break SS by setting `SS_ACTIVEWEAR_PASSWORD` to a wrong value. Restart.
2. Open the orders page.
3. **Expected**: Invoices that should have partial badges instead show "Partial status unavailable — Retry" with no asserted conclusion.
4. Revert the env var; refresh; badges return.

✅ Pass condition: No silent omission of the partial state; "unavailable" is explicit.

---

## Sign-off

All nine sections passed → the feature is ready to ship. Any failure means a bug to fix before merging.

Before merging to `master`, confirm:
- [ ] `lib/ssActivewear.js:335` still has `testOrder: true` (Constitution VI).
- [ ] `GOODS_IN_TRANSIT_STATUS_ID` is set to the real production value, not a placeholder.
- [ ] `proxy.js` `config.matcher` includes the new `/api/printavo-status-update` and `/api/orders-partial-state` routes (Principle VII).
- [ ] New env vars: none added (Constitution Secrets & Configuration).
- [ ] `README.md` env-var documentation: unchanged (no new vars). If any new vars are added later (e.g., a feature flag), document them per constitution.
