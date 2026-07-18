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
| `SANMAR_CUSTOMER_NUMBER` | SanMar numeric customer/account number (sent inside every SOAP request body) |
| `SANMAR_USERNAME` | SanMar.com web login username used for SOAP API authentication |
| `SANMAR_PASSWORD` | SanMar.com web login password used for SOAP API authentication |
| `FIXIE_URL` | Static-IP proxy URL from Fixie (usefixie.com) — required by SanMar, which whitelists a fixed outbound IP. Unset in local dev, where IP whitelisting doesn't apply. |
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

### Fixie Setup (SanMar Static IP)
SanMar's Web Services API whitelists a fixed outbound IP per integration — Vercel's serverless functions have no static IP by default, so SanMar calls are routed through [Fixie](https://usefixie.com), a managed static-IP HTTP proxy.
1. Sign up at [usefixie.com](https://usefixie.com) (a free tier is available) and copy the connection URL it gives you
2. Set `FIXIE_URL` in `.env.local` and in Vercel project settings — format: `http://fixie:<token>@<subdomain>.usefixie.com:80`
3. Fixie's dashboard shows the static IP address(es) your plan uses — give that IP to SanMar's integration team (`sanmarintegrations@sanmar.com`) for whitelisting
4. `lib/sanmar/soapClient.js` only routes through the proxy when `FIXIE_URL` is set — leave it unset in local dev

To generate a password hash: `node scripts/hash-password.mjs yourpassword`

## Tech Stack

- **Framework**: Next.js (App Router), React 19
- **Styling**: Tailwind CSS v4
- **Auth**: NextAuth.js v4
- **Deployment**: Vercel
- **External APIs**: Printavo, SS Activewear, SanMar

## Deployment

Push to any branch — Vercel auto-deploys previews. Merging to `master` deploys to production.
