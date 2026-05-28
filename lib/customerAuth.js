/**
 * Clerk customer auth client — the single point of contact with @clerk/nextjs.
 * All other modules that need the customer's email import from here (Principle V).
 *
 * Requires CLERK_SECRET_KEY env var, set automatically by the Vercel Marketplace
 * Clerk integration. See README.md for setup instructions.
 */

import { clerkClient } from '@clerk/nextjs/server';

/**
 * Returns the primary email address for a Clerk user ID.
 * Used in API routes to look up the customer's Printavo records by email.
 *
 * @param {string} clerkUserId
 * @returns {Promise<string|null>}
 */
export async function getCustomerEmail(clerkUserId) {
  if (!clerkUserId) return null;
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const primary = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  );
  return primary?.emailAddress ?? null;
}
