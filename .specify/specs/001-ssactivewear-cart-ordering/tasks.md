# Tasks: SS Activewear Cart & Ordering Workflow

**Input**: Design documents from `.specify/specs/001-ssactivewear-cart-ordering/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: NOT requested for this feature. The repo has no automated test framework configured (per plan.md Technical Context); validation is via the manual `quickstart.md` smoke test. No test tasks generated.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- File paths are exact and rooted at the repo (`/Users/scottie/repos/asp-webapp/`).

## Path Conventions

Single Next.js App Router project (per plan.md "Structure Decision"). All paths are relative to the repo root:

- New API routes: `app/api/<name>/route.js`
- New pages: `app/orders/<name>/page.jsx`
- New libs: `lib/<name>.js`
- New components: `components/<Name>.jsx`
- New context: `context/<Name>.js`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Light project hygiene before implementation. The Next.js project already exists — no initialization needed.

- [X] T001 [P] Document the SS Activewear env var pair (`SS_ACTIVEWEAR_USERNAME`, `SS_ACTIVEWEAR_PASSWORD`) in `README.md` under a new "Environment variables" section if not already present. Confirm `.env.local` is git-ignored (already true in `.gitignore`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-side catalog-lookup plumbing that User Story 1 and User Story 3 both depend on. Must complete before either story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Extend `lib/ssActivewear.js` with a new exported helper `lookupVariantsForLineItems(items)` where `items` is an array of `{ lineItemId, styleNumber, color }`. Implementation: group items by `styleNumber`, call `fetchSSProduct(styleNumber, { filterBy: 'style' })` once per group, filter variants by `color` (case-insensitive) where provided, return `[{ lineItemId, state: 'matched' | 'sanmar' | 'failed', variants?: CatalogVariant[], error?: string }]`. Treat null/empty `styleNumber` as `sanmar` without an API call. Catch per-group upstream errors and tag affected items with `state: 'failed'` — never throw out of the helper.

- [X] T003 Create `app/api/ss-catalog-lookup/route.js` implementing the contract at `.specify/specs/001-ssactivewear-cart-ordering/contracts/ss-catalog-lookup.md`. It MUST: (a) auth-gate via `getServerSession(authOptions)` returning `401` if absent; (b) validate `items` is a non-empty array with `lineItemId` on each element (return `400` otherwise); (c) delegate to `lookupVariantsForLineItems` from T002; (d) return `{ success: true, results }`. Add `console.log('[ss-catalog-lookup] batch size:', items.length)` at entry and per-failed-item `console.warn` lines. Keep the route file under 60 lines (constitution V — thin adapter).

**Checkpoint**: Server can classify a batch of invoice line items. User story implementation can now begin.

---

## Phase 3: User Story 1 - Identify Sourceable Items on an Invoice (Priority: P1) 🎯 MVP

**Goal**: Each line item on every invoice card shows exactly one of: "Add to Cart" button (matched), "Sanmar – Auto Order" badge, or "Lookup failed — Retry" control.

**Independent Test**: Open `/orders` while signed in. With at least one invoice loaded, every line item across every card must display one of the three states. Clicking Retry on a failed item must re-issue the lookup for that item only.

### Implementation for User Story 1

- [X] T004 [US1] Add a client-side React hook `useLineItemClassification(lineItems)` inline near the top of `app/orders/page.jsx` (or extract to `app/orders/_useLineItemClassification.js` if it exceeds ~80 lines). The hook accepts the flattened array of `InvoiceLineItem` objects and returns a `Map<lineItemId, CatalogMatchResult>`. On mount and whenever the input set changes, POST to `/api/ss-catalog-lookup` with `{ lineItemId, styleNumber: li.itemNumber, color: li.color }` for each line item, then merge the response into state. Each result must start in `state: 'pending'` until the response merges in.

- [X] T005 [US1] Modify `app/orders/page.jsx` `OrderOverview` table: add a new rightmost column "Sourcing" that renders, per row, based on `CatalogMatchResult.state`: `pending` → small spinner + "Checking..."; `matched` → an `<button>` labeled "Add to Cart" (handler is a no-op for now — wired in T012); `sanmar` → a non-interactive `<span>` styled as a badge with text "Sanmar – Auto Order"; `failed` → a button labeled "Lookup failed — Retry" with an error tooltip showing `error`. Use existing Tailwind tokens (`var(--accent)`, `var(--muted)`).

- [X] T006 [US1] In `app/orders/page.jsx`, expose a `retry(lineItemId)` function from the hook in T004 that re-POSTs `/api/ss-catalog-lookup` with only the failed item. Wire it to the "Retry" button rendered in T005. The line item must transition `failed → pending → matched|sanmar|failed`.

**Checkpoint**: User Story 1 is fully testable: classification labels render correctly per line item; retry works for failed items. Manual verification matches `quickstart.md` Step 1.

---

## Phase 4: User Story 2 - Add Items from Multiple Invoices to a Persistent Cart (Priority: P2)

**Goal**: Clicking "Add to Cart" on a matched line item adds its SKUs to a persistent cart visible across page navigation and across tabs. The cart count is visible from any authenticated page.

**Independent Test**: With US1 complete, click Add to Cart on a line item with sizes S, M, L. Verify the cart badge increments by the total of those size counts. Click Add to Cart on a line item from a *different* invoice; the cart now contains items from both invoices. Navigate to `/portfolio`, then back to `/orders` — cart count is preserved. Open a second browser tab on `/orders`, remove an item in tab A, verify tab B's count updates within ~1 s.

### Implementation for User Story 2

- [X] T007 [P] [US2] Create `lib/cart.js` exporting pure functions per data-model.md: `emptyCart()`, `addItem(cart, item)` (increments qty if SKU exists), `removeItem(cart, sku)`, `setQty(cart, sku, qty)` (qty ≤ 0 → remove), `groupByInvoice(cart)`, `totals(cart)` returning `{ itemCount, lineCount, grandTotal }`. No I/O — all functions take `cart` and return a new `cart`. Validate `qty` is a positive integer; coerce non-integers via `Math.floor`.

- [X] T008 [P] [US2] Create `lib/cartStorage.js` with: `readCart()` (returns `emptyCart()` if storage is empty, malformed, or version mismatched on `version: 1`), `writeCart(cart)` (updates `updatedAt` to `new Date().toISOString()` before serializing), `subscribe(callback)` (registers a `window.addEventListener('storage', ...)` listener filtered to key `asp.cart.v1` and returns an unsubscribe function). Storage key constant: `export const CART_STORAGE_KEY = 'asp.cart.v1'`. All functions MUST be SSR-safe (check `typeof window !== 'undefined'`).

- [X] T009 [US2] Create `context/CartContext.js` exporting a `<CartProvider>` component and a `useCart()` hook. The provider uses `useSyncExternalStore` with `subscribe` and `getSnapshot` backed by `lib/cartStorage.js` (T008). `useCart()` returns `{ cart, addItem, removeItem, setQty }` where each mutator calls the corresponding `lib/cart.js` (T007) pure function and persists via `writeCart`. Depends on T007 + T008.

- [X] T010 [P] [US2] Create `components/CartIndicator.jsx` — a `"use client"` component that consumes `useCart()` and renders a small badge with the cart's `itemCount` (from `totals(cart)`) and a link to `/orders/cart`. When `itemCount === 0`, render the icon only (no number). Use Tailwind utility classes only.

- [X] T011 [US2] Modify `components/Header.js` to render `<CartIndicator />` in its right-hand cluster, conditional on the existing authenticated-session check. Import is a named import from `components/CartIndicator.jsx`. Header must remain a Server Component if it already is; convert `CartIndicator` use to a leaf client boundary if needed.

- [X] T012 [US2] In `app/orders/page.jsx`, wire the "Add to Cart" button rendered in T005 to call `useCart().addItem` for each (size, color) variant on the line item. Expansion rule: for each `li.sizes[]` entry with `count > 0`, find the matching `CatalogVariant` in the `CatalogMatchResult.variants` (match on `sizeName` after `sizeLabel(...)` normalization and `colorName === li.color`) and emit one `CartItem` with `qty: count`. If a size has no matching variant, skip it silently (logged at `console.warn`). After adding, surface a brief "Added N items" toast or inline confirmation next to the button (re-uses any existing toast pattern or simple text + setTimeout fade).

- [X] T013 [US2] Modify `app/layout.js` to wrap `{children}` with `<CartProvider>` from `context/CartContext.js`. Confirm no other providers are broken; `CartProvider` must be inside any existing `SessionProvider` so `useCart` can rely on authenticated state if needed.

**Checkpoint**: Cart works end-to-end: items can be added from multiple invoices, persist across navigation, sync across tabs. Manual verification matches `quickstart.md` Steps 2–4.

---

## Phase 5: User Story 3 - Pre-Checkout Summary Screen (Priority: P3)

**Goal**: A `/orders/checkout` route displays cart items grouped by source invoice, with up-to-date SS Activewear stock warnings and per-item adjust/remove controls.

**Independent Test**: With items in the cart from multiple invoices, navigate to `/orders/cart` → click "Continue to Checkout" → `/orders/checkout`. Items are grouped under a header per invoice (e.g. `#1234 – Customer Name`). Each item shows name, qty, unit price, line total. A grand total displays at the bottom. If any item's available stock is less than requested, an inline warning offers "Reduce to N" and "Remove" actions. Both actions update the cart immediately.

### Implementation for User Story 3

- [X] T014 [US3] Create `app/orders/cart/page.jsx` — a `"use client"` cart-management view. Reads `useCart()`. Renders an empty-state "Your cart is empty" with a "Back to orders" link if `itemCount === 0`. Otherwise renders a single table: per-row image-placeholder, brand+style+color+size, a numeric `<input type="number" min="1">` for qty (calls `setQty`), unit price, line total, trash icon (calls `removeItem`). Footer shows grand total and a primary `<Link href="/orders/checkout">` button "Continue to Checkout".

- [X] T015 [US3] Create `app/orders/checkout/page.jsx` — a `"use client"` summary view. Reads `useCart()` and calls `groupByInvoice(cart)` (from `lib/cart.js`). Renders one section per invoice with a header showing the invoice `visualId`; under each section list the items with the same columns as the cart page minus qty input (read-only here). Add a "Place Order" primary button at the bottom (handler stubbed for US4). Add an "Empty cart" guard that redirects to `/orders/cart` or shows an empty state if `itemCount === 0`.

- [X] T016 [US3] In `app/orders/checkout/page.jsx`, on mount, build a unique `{ styleNumber, color }` set from cart items and POST `/api/ss-catalog-lookup` to refresh stock. From the response, derive a `Map<sku, availableQty>`. For each cart item, compute a `StockWarning` per data-model.md when `availableQty < cartItem.qty`. Render an inline warning chip ("Only N available" or "Out of stock") next to affected rows. While the fetch is pending, render a non-blocking "Checking stock..." indicator.

- [X] T017 [US3] In `app/orders/checkout/page.jsx`, add two small buttons inside each stock-warning chip: "Reduce to N" (calls `setQty(sku, availableQty)`) and "Remove" (calls `removeItem(sku)`). Both immediately update the cart and the displayed warning disappears for resolved rows. Submission MUST remain enabled regardless of any unresolved warnings (per FR-017).

**Checkpoint**: Checkout summary renders correctly, stock warnings appear and resolve. Manual verification matches `quickstart.md` Steps 5–6.

---

## Phase 6: User Story 4 - Order Submission Confirmation (Priority: P4)

**Goal**: Submitting the cart calls the existing `/api/place-order` endpoint, the user sees a success confirmation with the SS Activewear order reference, and the cart clears. Failures are surfaced clearly and the cart is preserved for retry.

**Independent Test**: With items in the cart and `/orders/checkout` loaded, click "Place Order". The button disables while the request is in flight. On success, a confirmation panel appears with `order.orderNum` / `order.invoiceNumber` (whatever the SS API returns) and the cart badge drops to 0. Force a failure (e.g. by temporarily breaking SS credentials per quickstart Step 8) and verify the cart remains intact and a readable error message is rendered. The user can correct the issue and re-click "Place Order" without losing data.

### Implementation for User Story 4

- [X] T018 [US4] In `app/orders/checkout/page.jsx`, implement the "Place Order" handler: while pending, disable the button and set a local `submitting` flag. POST `JSON.stringify({ lines: cart.items.map(i => ({ identifier: i.sku, qty: i.qty })), comments: 'Consolidated from invoices: ' + uniqueInvoiceVisualIds.join(', ') })` to `/api/place-order`. Parse the JSON response. Re-enable the button on completion (success or failure).

- [X] T019 [US4] In `app/orders/checkout/page.jsx`, on success (`response.success === true`): replace the page body with a confirmation panel showing the SS Activewear order reference fields from `response.order` (use `order.orderNum`, `order.poNumber`, or whichever fields the SS API actually returns; render the raw object in a `<details>` block for debug visibility). Call `setQty(sku, 0)` for each cart item — or expose a `clearCart()` helper in `useCart()` if cleaner — to empty the cart. The cart indicator badge must drop to 0.

- [X] T020 [US4] In `app/orders/checkout/page.jsx`, on error (HTTP error or `response.error` present): render an alert banner above "Place Order" with the error message verbatim. Do NOT clear the cart. The "Place Order" button must re-enable so the user can retry once the underlying issue is fixed (preserving FR-013).

**Checkpoint**: End-to-end submission works. Manual verification matches `quickstart.md` Steps 7–8.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Refinements that touch multiple stories or address spec-level edges not strictly in any one story.

- [X] T021 [P] In `app/orders/page.jsx`, render a sticky version of `<CartIndicator />` near the page header so it stays visible during long invoice lists. Use Tailwind `sticky top-...` on a wrapper; ensure it doesn't conflict with the page header layout.

- [X] T022 [P] Add empty-state UI to `app/orders/cart/page.jsx` and `app/orders/checkout/page.jsx` (covering the edge case "user navigates to checkout with empty cart" listed in spec.md). Both pages should render a "Your cart is empty — add items from the orders page" call to action with a link back to `/orders`.

- [X] T023 [P] Verify mobile responsiveness on `/orders`, `/orders/cart`, `/orders/checkout`: open each route at 375px viewport in browser DevTools and confirm all controls remain reachable and readable. Adjust any Tailwind class lists where overflow or wrapping breaks (use `sm:`/`md:` breakpoints consistent with the rest of `app/orders/page.jsx`).

- [ ] T024 Run the full manual smoke test in `.specify/specs/001-ssactivewear-cart-ordering/quickstart.md` Steps 1–8 against `npm run dev`. Fix any issues found before merging. **Deferred to operator** — requires live SS Activewear + Printavo credentials and a browser session. `npm run build` and `npm run lint` both pass cleanly (no new errors introduced).

- [X] T025 Run `npm run lint` and fix any ESLint warnings/errors introduced by new files. No new `console.log` calls should remain in non-API code per constitution Development Standards (API-side logging is fine).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can run immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational (needs `/api/ss-catalog-lookup`).
- **User Story 2 (Phase 4)**: Depends on Foundational AND US1 (wires cart actions into the buttons rendered in US1).
- **User Story 3 (Phase 5)**: Depends on US2 (reads cart state) and Foundational (re-uses `/api/ss-catalog-lookup` for stock).
- **User Story 4 (Phase 6)**: Depends on US3 (lives on the checkout page) — but ONLY structurally; functionally the place-order endpoint already exists.
- **Polish (Phase 7)**: Depends on all desired user stories being complete.

### Task-level dependencies inside each story

- T003 depends on T002 (route calls into the lib helper).
- T009 depends on T007 + T008 (context wraps the cart lib + storage).
- T011 depends on T010 (Header renders the indicator).
- T012 depends on T005 + T009 (Add to Cart wiring needs both the button and the cart hook).
- T013 depends on T009 (provider must exist before mounting).
- T014, T015 depend on T009 (read cart via `useCart`).
- T016 depends on T015 + T003 (checkout page calls the lookup route).
- T017 depends on T016 (warnings must render before actions can attach to them).
- T018, T019, T020 depend on T015.

### Parallel Opportunities

- T001 is parallelizable with anything (doc-only).
- T007, T008, T010 are all `[P]` within US2 — different files, no overlapping deps.
- T021, T022, T023 in Polish are all `[P]` — different files.

### Critical path

T001 → T002 → T003 → T004 → T005 → T009 → T012 → T015 → T016 → T018 → T024

(Setup → Foundational → US1 minimal UI → cart context → Add-to-Cart wiring → checkout page → stock check → submission → smoke test.)

---

## Parallel Example: User Story 2

Once Foundational and US1 are complete:

```bash
# All three of these can be developed in parallel (different files):
Task: "T007 [P] [US2] Implement lib/cart.js pure cart ops"
Task: "T008 [P] [US2] Implement lib/cartStorage.js localStorage + storage-event helpers"
Task: "T010 [P] [US2] Implement components/CartIndicator.jsx badge"

# Then sequentially:
Task: "T009 [US2] Implement context/CartContext.js using useSyncExternalStore"
Task: "T011 [US2] Wire <CartIndicator/> into components/Header.js"
Task: "T012 [US2] Wire Add to Cart buttons in app/orders/page.jsx"
Task: "T013 [US2] Wrap layout in <CartProvider>"
```

---

## Implementation Strategy

### MVP scope (User Story 1 only)

1. Complete Phase 1 (T001).
2. Complete Phase 2 (T002, T003) — `/api/ss-catalog-lookup` is live.
3. Complete Phase 3 (T004, T005, T006) — every line item on `/orders` is now labeled.
4. **STOP and validate**: Step 1 of `quickstart.md` passes; ship the MVP.

After MVP, the "Add to Cart" buttons exist but are non-functional — acceptable as a temporary state because the Sanmar labels and lookup-failure UX are already delivering visibility value (the foundation of the feature, per spec.md "Why this priority").

### Incremental delivery

1. **MVP**: Setup + Foundational + US1 → ship. Users see sourcing visibility.
2. **+ US2**: Cart works end-to-end across invoices and tabs → ship. Users can stage orders.
3. **+ US3**: Pre-checkout summary with stock warnings → ship. Users get a final review.
4. **+ US4**: Submission flow with success/error UX → ship. Full workflow complete.
5. **+ Polish**: Sticky indicator, empty states, mobile passes → ship.

Each step is an independently shippable increment.

### Parallel team strategy

With multiple developers:

1. Phase 1 + Phase 2 done together (small, ~1 hr).
2. Once Foundational lands:
   - Developer A: US1 (T004–T006).
   - Developer B: US2 foundation pieces (T007, T008, T010) in parallel.
3. After A's US1 lands and B's T009 lands, B picks up T012/T013 (cross-story integration).
4. Developer C can start US3 (T014, T015) using mocked cart state in parallel with B finishing US2.

---

## Notes

- **No automated tests** — see plan.md Technical Context. Validation is `quickstart.md`.
- `testOrder: true` remains hardcoded in `lib/ssActivewear.js#createSSOrder`. Do NOT flip it in this feature.
- All new client components must declare `"use client"` at the top. Server-side rendering of `<CartProvider>` should defer rendering until hydration to avoid SSR/localStorage mismatch (read empty cart on server, hydrate from `localStorage` on client).
- Commit after each task or logical group. Suggested commit messages:
  - "feat(ss-cart): add catalog lookup API route and helper (T002–T003)"
  - "feat(ss-cart): classify invoice line items as SS/Sanmar (US1)"
  - "feat(ss-cart): persistent cart with localStorage and tab sync (US2)"
  - "feat(ss-cart): pre-checkout summary with stock warnings (US3)"
  - "feat(ss-cart): consolidated order submission flow (US4)"
- Avoid: vague task descriptions, cross-story dependencies that prevent independent testing.
