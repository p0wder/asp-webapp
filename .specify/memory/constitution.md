# asp-webapp Constitution

## Core Principles

### I. Next.js App Router First
All pages and API routes use the Next.js App Router pattern (`app/` directory). No Pages Router patterns. Server Components are preferred by default; Client Components (`"use client"`) only when interactivity requires it.

### II. JavaScript (No TypeScript)
The project uses plain JavaScript throughout. No TypeScript, no `.ts`/`.tsx` files. JSDoc comments may be used for documentation where helpful.

### III. Simplicity & Minimal Dependencies
Add dependencies only when they provide significant value. Prefer built-in Next.js/React capabilities over third-party libraries. Every new dependency must be justified. YAGNI — don't build what isn't needed yet.

### IV. Tailwind CSS for Styling
All styling uses Tailwind CSS utility classes. No CSS-in-JS, no styled-components. Global styles go in `app/globals.css`. The design aesthetic is clean, minimalist black and white.

### V. API Routes as Thin Adapters
API routes in `app/api/` are thin adapters — they validate input, call library functions, and return responses. Business logic lives in `lib/`. Keep routes short and focused.

### VI. Environment Variables for Secrets
All secrets, API keys, and environment-specific config go in `.env.local` (never committed). Access via `process.env.*`. Document required variables in README.

## Technology Stack

- **Framework**: Next.js (App Router), React 19
- **Styling**: Tailwind CSS v4
- **Auth**: NextAuth.js v4
- **Language**: JavaScript (ES modules)
- **Deployment**: Vercel
- **External APIs**: Printavo (order management), SS Activewear (product catalog)
- **File Storage**: Vercel Blob

## Development Standards

- Components go in `components/` (shared UI) or colocated in `app/` pages
- Shared utilities and API clients go in `lib/`
- One-off scripts go in `scripts/`
- Keep components focused — split when a component exceeds ~150 lines
- Error handling: always return meaningful error messages from API routes
- No `console.log` left in production code (use only for debugging)

## Governance

This constitution supersedes all other practices. When in doubt, prefer simplicity and consistency with existing patterns in the codebase. New patterns require justification.

**Version**: 1.0.0 | **Ratified**: 2026-05-17 | **Last Amended**: 2026-05-17
