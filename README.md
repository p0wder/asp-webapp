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
| `SS_ORDER_MODE` | `test` or `live`. Decides the `testOrder` flag sent to S&S — see [S&S Order Configuration](#ss-order-configuration) |
| `SS_ACTIVEWEAR_ACCOUNT_EMAIL` | S&S website account email. Required — there is no fallback |
| `SS_ORDER_CONFIRMATION_EMAILS` | Comma-separated order-confirmation recipients (max 5) |
| `SS_ORDER_SHIPPING_METHOD` | S&S numeric freight method (`54` = free freight on our account) |
| `SS_SHIP_TO_CUSTOMER` | Ship-to company name |
| `SS_SHIP_TO_ATTN` | Ship-to attention line (optional) |
| `SS_SHIP_TO_ADDRESS` | Ship-to street line |
| `SS_SHIP_TO_CITY` | Ship-to city |
| `SS_SHIP_TO_STATE` | Ship-to state, two-letter code |
| `SS_SHIP_TO_ZIP` | Ship-to ZIP or ZIP+4 |
| `SS_SHIP_TO_COUNTRY` | Ship-to country, two-letter ISO code |
| `PRINTAVO_EMAIL` | Printavo API account email |
| `PRINTAVO_API_TOKEN` | Printavo API token |
| `APP_ORIGIN` | Canonical public origin (e.g. `https://threadgiant.com`). Optional — the request `Host` is used when unset |
| `NEXTAUTH_URL` | Legacy base URL, still read as an allowed origin and link base. Superseded by `APP_ORIGIN` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token (file uploads, webhook receipts) |
| `ADMIN_SETUP_TOKEN` | **No longer used.** The route it protected was removed in TG-001-09; delete this variable from Vercel |
| `EVENTBRITE_API_KEY` | Eventbrite API key for the Lead Inbox scanner |
| `TICKETMASTER_API_KEY` | Ticketmaster API key for the Lead Inbox scanner |
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

**Removed variables.** `NEXTAUTH_SECRET` and `ADMIN_USERS` were documented as
required but are read only by four unused `scripts/*.mjs` files — authentication
has been Clerk since NextAuth was decommissioned. They are live credentials for
a system that no longer runs; delete them from Vercel (tracked as variance V5 in
the [safety baseline](docs/baseline/TG-001-01-safety-baseline.md)).

### S&S Ordering Kill Switch

Live S&S Activewear order submission is gated by two independent switches.
**Both** must be open for a real order to be placed; either one closes it.

| Gate | Where | Purpose |
|---|---|---|
| `SS_LIVE_ORDERS_CODE_GATE` | `lib/ssOrderingGate.js` | In-code constant. Closing it requires a reviewable code edit and cannot be undone by an environment change. |
| `SS_ORDERING_ENABLED` | Environment | The owner's stop. Change it in Vercel project settings — no code change, review or merge needed. |

**The switch is fail-closed.** Only the exact string `true` (case-insensitive,
trimmed) permits ordering. A missing, empty or unrecognised value blocks it.

> ⚠️ **Deployers: set `SS_ORDERING_ENABLED=true` in Vercel, or live ordering
> will stop.** This is intentional — ambiguous configuration must never resolve
> toward placing a real supplier order.

**To stop live ordering:** set `SS_ORDERING_ENABLED=false` in Vercel project
settings, **then redeploy**.

> Vercel binds environment variables to a deployment. Changing the value in the
> dashboard does **not** affect the deployment already running — a redeploy is
> required for it to take effect. Use "Redeploy" on the current production
> deployment; no rebuild of your branch is needed.

This is still far faster than a code change (no edit, review or merge), but it
is not instantaneous — budget a minute or two for the redeploy. If you need
ordering stopped faster than that, remove the S&S credentials
(`SS_ACTIVEWEAR_USERNAME` / `SS_ACTIVEWEAR_PASSWORD`) as well, which fails the
adapter closed on the same redeploy.

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

### S&S Order Configuration

Every operating value for an S&S order is validated server configuration.
None of it is embedded in the submit adapter any more: the ship-to address,
the confirmation recipients, the freight method, the account email and — most
importantly — whether the order is a test or a live commitment.

> ⚠️ **This configuration is fail-closed and has no defaults.** Until every
> variable below is set in Vercel, `POST /api/place-order` returns `503` and
> **no order reaches S&S**. That is deliberate: a missing value must never be
> silently replaced by a guess on a live-money path.

| Variable | Example | Notes |
|---|---|---|
| `SS_ORDER_MODE` | `live` | Exactly `test` or `live`. Nothing else is accepted |
| `SS_ACTIVEWEAR_ACCOUNT_EMAIL` | `aspmerch@example.com` | Must be the S&S website account email |
| `SS_ORDER_CONFIRMATION_EMAILS` | `a@example.com,b@example.com` | Comma-separated, 1–5 addresses |
| `SS_ORDER_SHIPPING_METHOD` | `54` | `54` = free freight. Omitting it made S&S default to `1` (paid) |
| `SS_SHIP_TO_CUSTOMER` | `Americana Screen Printing` | |
| `SS_SHIP_TO_ATTN` | `Terry` | Optional |
| `SS_SHIP_TO_ADDRESS` | `209 E 29th St` | |
| `SS_SHIP_TO_CITY` | `South Sioux City` | |
| `SS_SHIP_TO_STATE` | `NE` | Two letters |
| `SS_SHIP_TO_ZIP` | `68776` | ZIP or ZIP+4 when the country is `US` |
| `SS_SHIP_TO_COUNTRY` | `US` | Two-letter ISO code |

**Three controls now govern a live order, and all three must pass:**

1. `SS_LIVE_ORDERS_CODE_GATE` in `lib/ssOrderingGate.js` — the in-code gate.
2. `SS_ORDERING_ENABLED=true` — the owner's runtime kill switch.
3. `SS_ORDER_MODE=live` with a complete, valid configuration.

Each is checked before credentials are read or a request body is built, so a
failure of any one produces **zero** calls to S&S.

**To place test orders instead of live ones:** set `SS_ORDER_MODE=test` and
redeploy. Orders still submit, but S&S treats them as tests. This is the
setting to use when investigating an order-shaping problem — the previous way
to do that was editing `testOrder` in `lib/ssActivewear.js`, which is what put
live ordering on `master` in commit `54d35c9`.

**Diagnosing a `503` from `/api/place-order`:** the response names the reason.

```json
{ "error": "S&S order configuration is invalid. No order was submitted.",
  "code": "SS_ORDER_CONFIG_INVALID",
  "fields": ["mode:MISSING", "shipTo.zip:INVALID"],
  "correlationId": "m_8f2c1a4b9d3e" }
```

`fields` names each offending variable and whether it is `MISSING` or
`INVALID`. Values are never echoed back or logged.

### Granting admin access

`/api/admin-setup` and `/api/debug-auth` were removed in TG-001-09. Admin roles
are managed in the Clerk dashboard:

1. Open the [Clerk dashboard](https://dashboard.clerk.com) → **Users**.
2. Select the user → **Metadata** → **Public metadata**.
3. Set `{ "role": "admin" }`. Remove the key to revoke.

`publicMetadata.role` is the authoritative source. For the edge check in
`proxy.js` to agree, the Clerk **session token** template must expose it:

```json
{ "publicMetadata": "{{user.public_metadata}}" }
```

Both layers resolve the role through the single resolver in `lib/roles.js`, so
they can no longer reach opposite conclusions the way they did before
TG-001-06. If the template is missing, the edge denies and the handler layer
also denies — the safe direction.

### Tracing a mutation in the logs

Every external mutation emits structured, redacted `[mutation]` lines sharing
one correlation ID. Responses that can fail carry that ID as `correlationId`,
so a customer or admin report leads straight to the right log lines:

```
[mutation] {"cid":"m_8f2c1a4b9d3e","system":"ss","operation":"createOrder",
            "phase":"attempt","mode":"live","testOrder":false,"lineCount":3}
[mutation] {"cid":"m_8f2c1a4b9d3e","system":"ss","operation":"createOrder",
            "phase":"failure","httpStatus":422,"error":"…"}
```

Search Vercel logs for the `cid`. Payloads, credentials, payment profiles,
street addresses and signed customer links are never logged — only allowlisted
fields, and those pass through a masker on the way out. If you need the raw
vendor payload, ask the vendor for their copy of the request by order number.

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

## Tech Stack

- **Framework**: Next.js (App Router), React 19
- **Styling**: Tailwind CSS v4
- **Auth**: Clerk (customer accounts and admin roles)
- **Payments**: Stripe Checkout
- **Deployment**: Vercel
- **External APIs**: Printavo, SS Activewear

## Deployment

Push to any branch — Vercel auto-deploys previews. Merging to `master` deploys to production.
