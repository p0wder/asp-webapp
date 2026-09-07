/**
 * The single role resolver for this application (TG-001-06).
 *
 * Pure module — no imports, no `process.env`, no Clerk SDK (Constitution
 * Principle IV). The Clerk adapters live in `lib/adminAuth.js` (route
 * handlers, server components) and `proxy.js` (edge middleware); both call
 * into this file so the two layers can no longer disagree.
 *
 * ── Why this module exists ───────────────────────────────────────────────
 * Before TG-001-06 the edge read `sessionClaims.role` while handlers read
 * `user.publicMetadata.role`. Those are different values populated by
 * different mechanisms: `publicMetadata.role` is what Clerk actually stores
 * (and what the admin bootstrap wrote), while `sessionClaims.role` only
 * exists if a custom Clerk JWT template maps it in. When the template was
 * missing or drifted, the two layers reached opposite conclusions and stayed
 * that way indefinitely.
 *
 * ── The canonical source ─────────────────────────────────────────────────
 * `publicMetadata.role` on the Clerk user is authoritative. Session claims
 * are a projection of it, and are accepted at the edge only because
 * middleware cannot fetch the full user without a network round trip on
 * every request. Handlers always re-check against the authoritative value,
 * so the edge is an optimisation and never the only decision.
 *
 * ── Clerk JWT template ───────────────────────────────────────────────────
 * For the edge check to work, the Clerk session token template must expose
 * public metadata. Either of these shapes is understood:
 *
 *     { "publicMetadata": "{{user.public_metadata}}" }
 *     { "metadata":       "{{user.public_metadata}}" }
 *
 * A bare top-level `role` claim is also read, for backward compatibility
 * with the template this project used before TG-001-06.
 *
 * ── Fail closed ──────────────────────────────────────────────────────────
 * Anything that is not a recognised role string resolves to `null`, which is
 * never privileged. Missing, malformed, non-string and unknown values all
 * deny.
 */

/** The only privileged role in this application. */
export const ADMIN_ROLE = 'admin';

/** Every role this application recognises. Anything else denies. */
export const KNOWN_ROLES = Object.freeze([ADMIN_ROLE]);

/**
 * Normalise one candidate role value.
 * Non-strings, empty strings and unknown roles all become `null`.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeRole(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return KNOWN_ROLES.includes(normalized) ? normalized : null;
}

/**
 * Resolve the role from a Clerk user object or a Clerk session-claims object.
 *
 * Both shapes are accepted so that the edge and the handler layer can share
 * one implementation. Claim locations are tried in descending order of
 * trustworthiness; the first that yields a recognised role wins.
 *
 * @param {object|null|undefined} source Clerk `User`, `sessionClaims`, or null.
 * @returns {string|null} A recognised role, or `null`.
 */
export function resolveRole(source) {
  if (!source || typeof source !== 'object') return null;

  const candidates = [
    // Authoritative: what Clerk stores on the user, and what a JWT template
    // mapped as `publicMetadata` projects.
    source.publicMetadata?.role,
    // Clerk's documented convention for exposing public metadata in a token.
    source.metadata?.role,
    // Legacy flat claim — the shape `proxy.js` relied on before TG-001-06.
    source.role,
  ];

  for (const candidate of candidates) {
    const role = normalizeRole(candidate);
    if (role) return role;
  }

  return null;
}

/**
 * True only when the source resolves to the admin role.
 *
 * @param {object|null|undefined} source Clerk `User` or `sessionClaims`.
 * @returns {boolean}
 */
export function hasAdminRole(source) {
  return resolveRole(source) === ADMIN_ROLE;
}
