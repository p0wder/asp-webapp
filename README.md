# asp-webapp

Internal web app for Thread Giant / Americana Screen Printing. Manages Printavo invoices, SS Activewear garment ordering, and customer quotes.

See [`.specify/memory/constitution.md`](.specify/memory/constitution.md) for architecture principles and development standards.

## Quick Start

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Environment Variables

Create `.env.local` in the repo root (git-ignored). Required variables:

| Variable | Purpose |
|---|---|
| `SS_ACTIVEWEAR_USERNAME` | SS Activewear dealer account username |
| `SS_ACTIVEWEAR_PASSWORD` | SS Activewear dealer account password |
| `SS_ORDERING_ENABLED` | **Kill switch for live S&S order submission.** Must be exactly `true` to permit orders. Missing, empty or any other value blocks submission — see [S&S Ordering Kill Switch](#ss-ordering-kill-switch) |
| `PRINTAVO_EMAIL` | Printavo API account email |
| `PRINTAVO_API_TOKEN` | Printavo API token |
| `NEXTAUTH_SECRET` | Random secret for admin session signing |
| `NEXTAUTH_URL` | Base URL (e.g. `http://localhost:3000`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token (file uploads) |
| `ADMIN_USERS` | JSON array of admin users with bcrypt-hashed passwords |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key — set automatically by Vercel Marketplace Clerk integration |
| `CLERK_SECRET_KEY` | Clerk secret key — set automatically by Vercel Marketplace Clerk integration |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Set to `/account/login` so Clerk redirects customers to the correct login page |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Set to `/my-orders` so customers land on their dashboard after login |
| `STRIPE_SECRET_KEY` | Stripe secret key — from Stripe dashboard or Vercel Marketplace Stripe integration |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key — used client-side on the payment page |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret — from Stripe dashboard webhook settings |
| `STATUS_TOKEN_SECRET` | Random secret (min 32 chars) for signing customer order status and proof access tokens |
| *(none required)* | Lead Inbox scanner uses RunSignup's public API — no key needed |
| `EVENTBRITE_LOCATION` | Default search location for the weekly cron scan, e.g. `Charlotte, NC` or a zip code (can be overridden per-scan in the UI) |
| `CRON_SECRET` | Random secret for authenticating Vercel cron requests to `/api/cron/refresh-leads` |

### S&S Ordering Kill Switch

Live S&S Activewear order submission is gated by two independent switches.
**Both** must be open for a real order to be placed; either one closes it.

| Gate | Where | Purpose |
|---|---|---|
| `SS_LIVE_ORDERS_CODE_GATE` | `lib/ssOrderingGate.js` | In-code constant. Closing it requires a reviewable code edit and cannot be undone by an environment change. |
| `SS_ORDERING_ENABLED` | Environment | The owner's immediate stop. Flip it in Vercel project settings — no deploy needed. |

**The switch is fail-closed.** Only the exact string `true` (case-insensitive,
trimmed) permits ordering. A missing, empty or unrecognised value blocks it.

> ⚠️ **Deployers: set `SS_ORDERING_ENABLED=true` in Vercel, or live ordering
> will stop.** This is intentional — ambiguous configuration must never resolve
> toward placing a real supplier order.

**To stop live ordering immediately:** set `SS_ORDERING_ENABLED=false` in Vercel
project settings and redeploy (or wait for the next request — the value is read
per-request, not cached at build time).

`POST /api/place-order` then returns `503` with:

```json
{ "error": "S&S ordering is currently disabled. No order was submitted.",
  "code": "SS_ORDERING_DISABLED",
  "reason": "DISABLED_BY_OWNER" }
```

`reason` is one of `CONFIG_MISSING`, `CONFIG_INVALID`, `DISABLED_BY_OWNER`, or
`CODE_GATE_CLOSED`.

**What keeps working while ordering is disabled:** all S&S read, catalog,
status and reconciliation paths — including `getSSOrdersByPO`, the purchasing
catalog lookup, and `/api/orders-partial-state`. Only order *submission* is
blocked, so open orders can still be tracked and reconciled.

### Clerk Setup (Customer Accounts)
1. Go to [vercel.com/marketplace](https://vercel.com/marketplace) and add the **Clerk** integration to your project
2. This auto-sets `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
3. Manually add `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/account/login` and `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/my-orders`
4. In the Clerk dashboard, enable **Email OTP** as the sign-in method and disable passwords

### Stripe Setup (Payment Collection)
1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Copy `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` from the Stripe dashboard
3. Create a webhook endpoint pointing to `https://your-domain.com/api/stripe-webhook` for the `checkout.session.completed` event
4. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`

To generate a password hash: `node scripts/hash-password.mjs yourpassword`

## Tech Stack

- **Framework**: Next.js (App Router), React 19
- **Styling**: Tailwind CSS v4
- **Auth**: NextAuth.js v4
- **Deployment**: Vercel
- **External APIs**: Printavo, SS Activewear

## Deployment

Push to any branch — Vercel auto-deploys previews. Merging to `master` deploys to production.
