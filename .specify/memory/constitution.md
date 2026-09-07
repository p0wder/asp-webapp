<!--
SYNC IMPACT REPORT
==================
Version change: 1.2.0 → 1.3.0
Bump rationale: MINOR — Principle VII redefined around the actual auth
system (Clerk) with new MUSTs (one shared role resolver; the authoritative
source named); Principle III's authentication step corrected; Principle VI
expanded with the operating-configuration requirement. No principle removed.

Amended under Track B of EPIC-TG-001 (TG-001-04, -05, -06, -07, -08, -09,
-10), which closes the remaining half of variance V7: Principle VII still
mandated `getServerSession(authOptions)`, a function that has not existed
since NextAuth was decommissioned. An agent following it literally wrote
NextAuth code against a Clerk application.

Modified principles:
  - III. API Routes as Thin Adapters — the authentication example now names
    the function that exists (`requireAdmin()`), not the one that does not
  - VI. Safety Defaults for Real-World Side Effects — added the validated,
    fail-closed operating-configuration requirement (TG-001-10)
  - VII. Defence-in-Depth Auth on Protected Routes — rewritten for Clerk;
    names `publicMetadata.role` as authoritative and requires both layers to
    resolve it through the single resolver in `lib/roles.js`

Added sections:
  - Operational Logging and Correlation (under Development Standards) —
    codifies the redaction rules from TG-001-08

Known remaining drift: none from V7. Variance V1 (no datastore) is
unchanged and still blocks TG-001-03 and the exactly-once half of
TG-001-05; it is a missing capability, not a stale rule.

--- superseded 1.1.0 → 1.2.0 report retained below ---

Version change: 1.1.0 → 1.2.0
Bump rationale: MINOR — Principle VI materially expanded with new MUSTs
(mandatory fail-closed runtime kill switch on live side-effect paths;
reconciliation paths must survive a closed switch). No principle removed
or contradicted.

Amended under TG-001-02 (EPIC-TG-001), which found the prior text
factually wrong: it cited `createSSOrder` as hardcoding `testOrder: true`
when it has sent `testOrder: false` since commit 54d35c9. An agent
following the stale example literally would have believed live ordering
was already contained. Corrected and re-anchored to the actual gates.

Modified principles:
  - VI. Safety Defaults for Real-World Side Effects — added the
    fail-closed kill-switch requirement, the "reads stay available"
    requirement, and the two-gate model; corrected the canonical example

Known remaining drift (NOT fixed here — owned by TG-001-06):
  ⚠ Principle VII still mandates `getServerSession(authOptions)`, which
    no longer exists anywhere in the codebase; authentication is Clerk.
    Agents following Principle VII literally will write NextAuth code.
    See docs/baseline/TG-001-01-safety-baseline.md variance V7.

--- superseded 1.0.0 → 1.1.0 report retained below ---

Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR — four new principles added (Pure Logic vs. I/O,
External API Clients, Safety Defaults, Defence-in-Depth Auth) reflecting
patterns observed throughout the codebase; existing principles refined
with normative MUST/SHOULD language. No principles removed or contradicted.

Modified principles:
  - I. Next.js App Router First — clarified extension/colocation conventions
  - II. JavaScript (No TypeScript) → JavaScript Only — No TypeScript
  - III. Simplicity & Minimal Dependencies → moved into Development Standards
  - IV. Tailwind CSS for Styling → moved into Styling & Design section
  - V. API Routes as Thin Adapters — promoted to Principle III, requirements made testable
  - VI. Environment Variables for Secrets → moved into Secrets & Configuration

Added principles:
  - IV. Pure Logic Separated from I/O
  - V. External APIs Wrapped in `lib/` Clients
  - VI. Safety Defaults for Real-World Side Effects
  - VII. Defence-in-Depth Auth on Protected Routes

Added sections:
  - Styling & Design (consolidates Tailwind + visual aesthetic)
  - Secrets & Configuration (consolidates env var rules)

Removed sections: none (prior content preserved or relocated)

Templates requiring updates:
  - ✅ .specify/memory/constitution.md (this file)
  - ⚠ .specify/templates/plan-template.md — "Constitution Check" section
    is generic; consider adding gate items keyed to Principles III–VII
    (lib/ adapter check, safety-default check, two-layer auth check) on
    next plan authoring. No automatic edit needed; flagged for human review.
  - ✅ .specify/templates/spec-template.md — generic, no change required
  - ✅ .specify/templates/tasks-template.md — generic, no change required
  - ✅ README.md — already links to this constitution

Follow-up TODOs: none
-->

# asp-webapp Constitution

## Core Principles

### I. Next.js App Router First

All pages, layouts, and API routes MUST live under `app/` and follow the
Next.js App Router conventions. The Pages Router (`pages/`) MUST NOT be used.

Server Components are the default. A file MUST use `"use client"` only when it
needs state, effects, refs, browser APIs, or event handlers that cannot be
handled by a child Client Component. Client interactivity SHOULD be pushed to
small leaf components rather than promoted up the tree.

Custom middleware lives in `proxy.js` (this project's chosen filename); its
`config.matcher` is the single source of truth for which routes are auth-gated
at the edge.

**Rationale**: The App Router is the framework's supported direction; mixing
routers fragments routing logic. Keeping client boundaries narrow preserves
streaming, RSC payload size, and SEO defaults.

### II. JavaScript Only — No TypeScript

All source files MUST be `.js`, `.jsx`, or `.mjs`. `.ts` / `.tsx` files MUST
NOT be added, and no `tsconfig.json` is permitted. Path aliases live in
`jsconfig.json` (`@/*` → repo root).

JSDoc comments MAY be used to document non-obvious function shapes and are
encouraged on `lib/` clients that wrap external APIs. JSDoc is NOT required
on every export.

**Rationale**: This is a small internal tool; TS tooling, build steps, and
type-maintenance overhead do not pay off at this scale.

### III. API Routes as Thin Adapters

Every handler in `app/api/**/route.js` MUST follow this shape, in order:

1. Authenticate — `requireAdmin()` from `lib/adminAuth.js` for admin routes,
   `auth()` from `@clerk/nextjs/server` for customer routes, or
   `verifyStatusAccess` / `verifyProofAccess` from `lib/accessControl.js` for
   token-or-session customer links. Return 401 (or 403) on failure.
2. Validate the request body / query and return 400 on invalid input.
3. Delegate to one or more functions in `lib/`.
4. Return `NextResponse.json(...)` with a meaningful status.

Business logic, external HTTP calls, credential reading, data shaping, and
pricing math MUST NOT live in route handlers — they MUST live in `lib/`.
A handler longer than ~80 lines is a smell and SHOULD be refactored by moving
logic into `lib/`.

**Rationale**: Routes are an adapter layer; keeping them thin makes the
underlying logic reusable from scripts under `scripts/`, easy to read, and
trivial to swap behind a different transport if ever needed.

### IV. Pure Logic Separated from I/O

Modules that touch storage, network, environment variables, or browser
globals (`window`, `localStorage`, `document`) MUST be separated from
modules that contain pure transformations.

The canonical example is `lib/cart.js` (pure functions taking a cart value
and returning a new cart) vs. `lib/cartStorage.js` (the localStorage
adapter and cross-tab subscription). New cart-like features MUST follow
the same split.

Pure modules MUST NOT import I/O modules. I/O modules MAY import pure
modules.

**Rationale**: Pure functions are trivially exercisable in scripts, work
identically on server and client, and isolate stateful concerns to a
single replaceable module.

### V. External APIs Wrapped in `lib/` Clients

Every third-party service (Printavo, SS Activewear, Vercel Blob, NextAuth,
etc.) MUST be reached through a single dedicated `lib/*.js` client module
(e.g., `lib/printavo.js`, `lib/ssActivewear.js`). Route handlers and
components MUST NOT call external APIs directly.

Client modules MUST:

- Read credentials from `process.env` and throw a clear error if a required
  variable is missing.
- Export named functions, not classes or default exports.
- Log request and response payloads via `console.log` / `console.error`
  for any call that mutates external state (placing orders, creating
  quotes, creating customers). These logs are this project's audit trail
  in Vercel.

Read-only / catalog-lookup calls SHOULD log on error only, to avoid
flooding logs.

**Rationale**: Centralising integration code makes credential handling,
error wrapping, and request-shape changes a one-file edit. Verbose logging
of mutations gives us a reconstructible trail for any external write that
affects a customer or a real-money operation.

### VI. Safety Defaults for Real-World Side Effects

Any code path that triggers a real-world commitment — placing a vendor
order, charging a card, sending production email, mutating a customer
record at Printavo — MUST default to safe / test mode and require an
explicit, in-code change to go live. Runtime flags (env vars, query
params, headers) MUST NOT be the sole gate.

Additionally, any such path that is live MUST carry a runtime kill switch
that an owner can close without a deploy. The kill switch MUST be
fail-closed: missing, empty or unrecognised configuration blocks the
side effect rather than permitting it. Closing the switch MUST NOT
disable the corresponding read, status or reconciliation paths — work
already committed externally must remain observable.

These two controls are complementary, not alternatives. The in-code gate
satisfies "no runtime flag is the sole gate"; the kill switch satisfies
"an owner can stop this now." A live path needs both.

Additionally, the operating values such a path uses — test-versus-live
mode, destination identity, notification recipients, account identity —
MUST come from validated server configuration, not from literals in the
adapter. Validation MUST be fail-closed and MUST NOT substitute a
default: a missing or malformed value blocks the side effect rather than
being guessed. Whether a path is in test or live mode MUST be an explicit,
environment-bound value that appears in the audited preflight record.

The canonical example is S&S order submission. `lib/ssOrderingGate.js`
holds the in-code gate (`SS_LIVE_ORDERS_CODE_GATE`) and the pure
evaluation of both gates; `lib/ssOrderingSwitch.js` is the environment
adapter reading the fail-closed runtime switch (`SS_ORDERING_ENABLED`);
`lib/ssOrderConfig.js` validates the operating configuration and
`lib/ssOrderConfigEnv.js` reads it. `createSSOrder` in
`lib/ssActivewear.js` evaluates all three before reading credentials or
building a request body, so any one of them failing yields zero supplier
calls.

Note that `createSSOrder` sends `testOrder: false` when `SS_ORDER_MODE`
is `live` — real orders have been live, deliberately, since commit
54d35c9. What contains that is the three controls above, not a literal
in the adapter; there is no longer a `testOrder` literal to read.

When a safety default is changed, the PR description MUST call out the
change explicitly.

**Rationale**: Internal tooling is operated by a small team without a
staging environment; the cost of an accidental real order is much higher
than the friction of editing a file before going live.

### VII. Defence-in-Depth Auth on Protected Routes

Authentication is **Clerk**. NextAuth was decommissioned; `next-auth` is
still an installed dependency but is imported nowhere, and
`getServerSession` does not exist in this codebase. Code MUST NOT be
written against it.

Any route that performs admin actions or exposes admin data MUST be
protected at TWO layers:

1. A matcher entry in `proxy.js` `config.matcher` so unauthenticated
   page requests redirect to `/login` and unauthenticated API requests
   receive 401.
2. An authorization check at the top of the route handler —
   `requireAdmin()` from `lib/adminAuth.js` — that returns 401 when it
   fails.

`publicMetadata.role` on the Clerk user is the **authoritative** role
source. Session claims are a projection of it, accepted at the edge only
because middleware cannot fetch the full user without a network round
trip per request; the handler layer always re-checks the authoritative
value, so the edge is an optimisation and never the only decision.

Both layers MUST resolve the role through the single resolver in
`lib/roles.js`. Comparing a claim inline (`sessionClaims?.role ===
'admin'`) is a violation: that is precisely how the two layers came to
disagree indefinitely, with the edge denying admins the handler would
allow, or the reverse.

Role resolution MUST fail closed. A missing, malformed, non-string or
unrecognised role denies.

Adding a new admin endpoint without both layers is a constitution
violation. Public endpoints (e.g., `/api/submit-quote`, `/api/upload`)
MAY skip the proxy matcher but MUST carry, and justify inline, the
controls in `lib/httpGuards.js` and `lib/rateLimit.js` — origin guard,
schema validation, payload limit and rate-limit policy.

Bootstrap and diagnostic endpoints — anything that mutates roles or
returns session claims and account metadata — MUST NOT exist in the
deployed application. Role changes are made through the Clerk dashboard;
see "Granting admin access" in `README.md`. The route inventory in
`tests/e2e/route-inventory.spec.js` enforces this on every run.

**Rationale**: A misconfigured matcher should not silently expose data.
Each layer is cheap; together they make an unauthenticated leak require
two simultaneous mistakes — but only if both layers are asking the same
question of the same source.

## Technology Stack

- **Framework**: Next.js (App Router) + React 19 with the React Compiler
- **Language**: JavaScript (ES modules)
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/postcss`)
- **Auth**: Clerk (`@clerk/nextjs`) — customer accounts and admin roles.
  `next-auth` and `bcryptjs` remain installed but are used only by unused
  `scripts/*.mjs`; treat both as pending removal, not as the auth system
- **Payments**: Stripe Checkout (`stripe`)
- **File storage**: Vercel Blob (`@vercel/blob`)
- **Forms**: `react-hook-form` (admin forms only — public forms MAY use
  uncontrolled native inputs)
- **External APIs**: Printavo (GraphQL), SS Activewear (REST)
- **Deployment**: Vercel — `master` is production; every other branch
  produces a preview deployment automatically

Adding a runtime dependency MUST be justified in the commit message or
PR description. Prefer Next.js, React, and Web-Platform built-ins.

## Styling & Design

All styling MUST use Tailwind utility classes. CSS-in-JS libraries
(styled-components, Emotion, vanilla-extract, etc.) MUST NOT be added.
Inline `<style>` tags are reserved for the FOUC-prevention theme-init
script in `app/layout.js`.

Global tokens (CSS variables for theme colors, base resets) live in
`app/globals.css`. Dark-mode is class-based (`.dark` on `<html>`) and
initialised before first paint by the inline script in the root layout.

The visual aesthetic is clean, minimalist, and high-contrast — black and
white with restrained accents. New components SHOULD match the existing
header/footer/page-frame styling rather than introducing novel patterns.

## Secrets & Configuration

All secrets, API keys, and environment-specific values MUST live in
`.env.local` (git-ignored — enforced by `.gitignore` rule `.env*`).
Production values live in Vercel project settings.

Every required env var MUST be documented in `README.md` with a one-line
purpose. Adding a new env var without updating `README.md` is a
constitution violation.

`process.env.*` MUST be accessed only inside `lib/` modules and
server-side code (route handlers, layouts, server components,
`proxy.js`). Client Components MUST NOT read `process.env` directly.

## Development Standards

**File organisation**

- `app/` — pages, layouts, and API routes (App Router)
- `app/api/*/route.js` — thin API adapters (see Principle III)
- `components/` — shared UI components (rendered in multiple pages)
- `context/` — React context providers (Client Components)
- `lib/` — external API clients, pure logic, pricing math
- `scripts/` — one-off Node scripts (`.mjs`), runnable with `node`
- `public/` — static assets served verbatim

Components SHOULD be split when they exceed ~150 lines or when a
distinct concern (a form, a modal, a list row) can be lifted out.

**Logging**

- Mutating external API calls MUST be logged (see Principle V), through
  `logMutation` in `lib/mutationLog.js`.
- Route handlers MUST log errors with a `[route-name]` prefix.
- Ad-hoc debugging `console.log`s SHOULD be removed before merging.
  Audit-trail logs in `lib/` clients are intentional and stay.

**Operational Logging and Correlation**

Raw request and response bodies MUST NOT be logged. `JSON.stringify` of a
vendor payload is a violation — it is how payment-profile IDs, account
emails and full ship-to addresses reached the log stream.

Instead, every external mutation MUST emit:

- One `attempt` line before the call and exactly one `success`, `failure`
  or `blocked` line after it.
- A correlation ID (`cid`) shared by every line of one user action, and
  returned to the caller on any failure response so a report can be traced
  to its logs without the payload being exposed.
- Allowlisted fields only, which the emitter additionally passes through
  the maskers in `lib/logRedaction.js`. Two independent controls: the
  caller chooses what is interesting, the emitter masks what is sensitive.

Secrets, tokens, payment profiles, full postal addresses, signed customer
links and end-user identifiers MUST NOT appear in logs — including inside
error messages, which vendor SDKs routinely fill with whole response
bodies. Restoring raw logging is never an acceptable rollback.

**Error messages**

API routes MUST return JSON of the shape `{ error: "<message>" }` with a
correct HTTP status. Error messages SHOULD be specific enough that a log
reader can identify the cause without re-running the request.

**Dependencies**

YAGNI applies. Do not add a library to solve a problem that one to three
lines of code already solves. New dependencies MUST be justified.

## Governance

This constitution supersedes ad-hoc convention. When in doubt, prefer
the rule encoded here; when the rule and an existing pattern in the
code disagree, the rule is the source of truth and the code SHOULD be
brought into alignment incrementally.

**Amendment procedure**

1. Open a PR that edits this file alongside any code changes that
   depend on the new rule.
2. Update the version line below per the rules in the Versioning
   policy.
3. Update the Sync Impact Report comment at the top of this file.
4. If a dependent template (`plan-template.md`, `spec-template.md`,
   `tasks-template.md`) needs alignment, edit it in the same PR.

**Versioning policy** (semantic):

- **MAJOR**: A principle is removed, redefined in a backward-incompatible
  way, or the governance procedure itself changes.
- **MINOR**: A new principle is added, or an existing principle is
  materially expanded (new MUSTs or SHOULDs).
- **PATCH**: Wording, typos, clarifications, reordering, non-semantic
  refinements.

**Compliance review**

Authors of new code MUST self-check each PR against the principles
above. Findings during code review SHOULD reference the specific
principle by Roman numeral (e.g., "violates Principle III — pricing
math should move into `lib/`"). Violations that ship MUST be tracked
as follow-up and remediated.

 **Version**: 1.3.0 | **Ratified**: 2026-05-17 | **Last Amended**: 2026-09-07
