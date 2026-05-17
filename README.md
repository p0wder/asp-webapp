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
| `PRINTAVO_EMAIL` | Printavo API account email |
| `PRINTAVO_API_TOKEN` | Printavo API token |
| `NEXTAUTH_SECRET` | Random secret for session signing |
| `NEXTAUTH_URL` | Base URL (e.g. `http://localhost:3000`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token (file uploads) |
| `ADMIN_USERS` | JSON array of admin users with bcrypt-hashed passwords |

To generate a password hash: `node scripts/hash-password.mjs yourpassword`

## Tech Stack

- **Framework**: Next.js (App Router), React 19
- **Styling**: Tailwind CSS v4
- **Auth**: NextAuth.js v4
- **Deployment**: Vercel
- **External APIs**: Printavo, SS Activewear

## Deployment

Push to any branch — Vercel auto-deploys previews. Merging to `master` deploys to production.
