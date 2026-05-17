# Quickstart: SS Activewear Cart & Ordering Workflow

**Feature**: 001-ssactivewear-cart-ordering · **Date**: 2026-05-17

End-to-end manual verification for the SS Activewear cart workflow. Run against the local dev server. There is no automated test framework in this repo.

---

## Prerequisites

1. Local checkout of `asp-webapp` with feature branch implementation applied.
2. `.env.local` populated with:
   - `SS_ACTIVEWEAR_USERNAME` / `SS_ACTIVEWEAR_PASSWORD` (dealer account)
   - `PRINTAVO_EMAIL` / `PRINTAVO_TOKEN` (Printavo API access)
   - `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and any admin user credential the project uses.
3. Node 18+ installed.
4. ⚠️  `testOrder: true` is still hardcoded in `lib/ssActivewear.js`. No real SS Activewear order will be placed — confirmation emails will be flagged as test orders.

```bash
npm install
npm run dev
# open http://localhost:3000
```

Sign in via the existing `/login` page using your admin credentials.

---

## Smoke test (10 minutes)

### Step 1 — Verify catalog classification on the orders page (FR-001/2/3)

1. Navigate to `http://localhost:3000/orders`.
2. Confirm at least one invoice card renders with the expanded "Order Overview".
3. For each line item, verify exactly one of:
   - **"Add to Cart" button** rendered next to a sourceable item.
   - **"Sanmar – Auto Order" badge** rendered next to an item without a style number, or with a style number that returned zero matches.
   - **"Lookup failed — Retry"** rendered if the SS Activewear API request errored. Click Retry and verify the item re-classifies.

✅ Pass when every line item displays one of the three states and none remain stuck in `pending`.

---

### Step 2 — Add items from one invoice (User Story 2 / FR-004)

1. On a matched line item with multiple sizes (e.g. S, M, L), click **Add to Cart**.
2. Choose a size variant in the popover (if implemented as a popover) or accept the default expansion (one per size in the line item).
3. Verify:
   - The cart indicator badge in the page header increments by the number of sizes×qty added.
   - The same line item now shows a small "✓ in cart" hint or similar.

✅ Pass when the cart indicator shows the expected count and the source line item reflects the cart state.

---

### Step 3 — Add items from multiple invoices (FR-006)

1. Scroll to a second invoice card.
2. Click **Add to Cart** on a matched line item.
3. Verify the cart indicator count increases without losing items added in Step 2.

✅ Pass when the cart indicator reflects items from both invoices.

---

### Step 4 — Cart persists across navigation (FR-005)

1. Navigate to `/portfolio` or any other page.
2. Navigate back to `/orders`.
3. Verify the cart indicator still shows the previous count.
4. Open a second browser tab on `/orders`.
5. Remove one item in tab A.
6. Verify tab B's cart indicator updates (via the `storage` event) within ~1 s.

✅ Pass when the cart survives navigation and syncs between tabs.

---

### Step 5 — Cart page edit (FR-007, FR-008a)

1. Click the cart indicator → routes to `/orders/cart`.
2. Verify cart items are listed with style/color/size/qty/unit price.
3. Edit a quantity to `5`. Verify the line total updates and the cart-indicator count reflects the change.
4. Edit a quantity to `0`. Verify the item is removed.
5. Click the trash icon on another item. Verify it is removed and the indicator decrements.

✅ Pass when qty edits and removals are reflected everywhere immediately.

---

### Step 6 — Pre-checkout summary (FR-009, FR-010, FR-017)

1. Click **Continue to Checkout** on `/orders/cart` → routes to `/orders/checkout`.
2. Verify items are grouped under a section header per source invoice (e.g. `#1234 – Customer Name`).
3. Verify each item shows name/qty/unit price/line total.
4. Verify a grand total appears at the bottom.
5. If any item has a stock warning ("Only 8 in stock" or "Out of stock"), verify the inline **Reduce to N** and **Remove** controls work as expected.

✅ Pass when summary content matches the cart state and stock controls function.

---

### Step 7 — Submit consolidated order (FR-011, FR-012, FR-014)

1. Click **Submit Order**. The button MUST disable while the request is in flight.
2. Wait for the success confirmation panel showing the SS Activewear order reference (`order.orderID` or `invoiceNumber`).
3. Verify the cart is now empty (indicator shows `0`).
4. Optional — confirm a test-order confirmation email arrived at `aspmerch@gmail.com` and/or `gramigscott@gmail.com`.

✅ Pass when the success state shows a reference and the cart clears.

---

### Step 8 — Error preserved (FR-013)

1. Temporarily break SS Activewear creds (e.g. set `SS_ACTIVEWEAR_PASSWORD=wrong` in `.env.local`, restart dev server).
2. Re-add items to the cart and click **Submit Order**.
3. Verify a clear error message is rendered and the cart remains intact.
4. Restore correct credentials and retry; the order should now succeed.

✅ Pass when the failure surfaces a readable error and the cart is not cleared.

---

## Cross-cutting verifications

- **Mobile responsiveness** — Repeat Steps 1, 5, 6 in a viewport ≤ 375px. All controls remain reachable and readable.
- **Dark mode** — Toggle the existing theme switcher; verify cart and checkout pages honor the design tokens (`var(--surface)`, `var(--accent)`).
- **Auth gate** — Sign out, then attempt to navigate directly to `/orders/cart` and `/orders/checkout`. Verify the existing auth gate redirects to `/login` (or returns 401 if accessing the API).
- **Empty cart** — At `/orders/cart` and `/orders/checkout` with no items, verify a clear empty state is shown and the **Submit Order** action is disabled (edge case from spec).

---

## Known limitations (v1)

- Single-user only — no server-side cart sync across devices (Clarification Q2).
- No server-side idempotency token — clicking Submit twice quickly is prevented by the disabled-button state only (R8). Acceptable while `testOrder: true` is hardcoded.
- Pricing is sourced from Printavo, not SS Activewear (R10).

---

## Rollback

The feature is additive. To revert:

1. Remove `app/orders/cart/`, `app/orders/checkout/`, `app/api/ss-catalog-lookup/`.
2. Revert `app/orders/page.jsx` and `components/Header.js` to their pre-feature state (git history).
3. Remove `lib/cart.js`, `lib/cartStorage.js`, `context/CartContext.js`, `components/CartIndicator.jsx`.
4. The cart is in `localStorage` only — no DB cleanup needed. Users may clear via DevTools → Application → Local Storage → key `asp.cart.v1`.
