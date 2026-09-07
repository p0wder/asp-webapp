/**
 * Clerk adapter for admin authorization in route handlers and server
 * components (Constitution Principle V, VII).
 *
 * The role decision itself is not made here — it is delegated to the single
 * resolver in `lib/roles.js`, which `proxy.js` also uses. This module only
 * supplies the Clerk user (TG-001-06).
 */

import { currentUser } from '@clerk/nextjs/server';
import { hasAdminRole, resolveRole } from './roles.js';

/**
 * True when the caller is a signed-in user with the admin role.
 *
 * Reads the authoritative Clerk `publicMetadata.role` rather than a session
 * claim, so a missing or stale JWT template cannot grant admin here. Fails
 * closed: any error resolving the user denies.
 *
 * @returns {Promise<boolean>}
 */
export async function requireAdmin() {
  try {
    const user = await currentUser();
    return hasAdminRole(user);
  } catch (err) {
    console.error('[adminAuth] Failed to resolve current user; denying:', err?.message || err);
    return false;
  }
}

/**
 * The caller's resolved role, or `null` when signed out or unrecognised.
 * Use when a handler needs to distinguish "customer" from "signed out";
 * prefer `requireAdmin()` for a plain admin gate.
 *
 * @returns {Promise<string|null>}
 */
export async function currentRole() {
  try {
    return resolveRole(await currentUser());
  } catch {
    return null;
  }
}
