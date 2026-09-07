import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { hasAdminRole } from '@/lib/roles';

// Customer routes protected by Clerk (magic link / OTP / OAuth)
const isProtectedCustomerRoute = createRouteMatcher(['/my-orders(.*)']);

// Admin routes protected by Clerk with role: admin
const isAdminRoute = createRouteMatcher([
  '/purchasing(.*)',
  '/pipeline(.*)',
  '/leads(.*)',
  '/dashboard/promo-codes(.*)',
  '/dashboard/marketing(.*)',
  '/api/ready-to-order(.*)',
  '/api/quotes(.*)',
  '/api/place-order(.*)',
  '/api/printavo-status-update(.*)',
  '/api/orders-partial-state(.*)',
  '/api/ss-catalog-lookup(.*)',
  '/api/payment-profiles(.*)',
  '/api/search-products(.*)',
  '/api/quote-status-update(.*)',
  '/api/proof-upload(.*)',
  '/api/promo-codes(.*)',
  '/api/printavo-customers(.*)',
  '/api/leads(.*)',
  // TG-001-09 removed `/api/admin-setup` and `/api/debug-auth`. These entries
  // are kept deliberately: if either file is ever re-created, it is admin-gated
  // from its first request rather than public by default. Admin roles are now
  // managed in the Clerk dashboard — see README, "Granting admin access".
  '/api/admin-setup(.*)',
  '/api/debug-auth(.*)',
]);

export const proxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedCustomerRoute(request)) {
    await auth.protect();
  }

  if (isAdminRoute(request)) {
    const { userId, sessionClaims } = await auth();
    // Single role resolver, shared with lib/adminAuth.js (TG-001-06). The
    // handler layer re-checks against Clerk's authoritative publicMetadata,
    // so this edge check narrows traffic but is never the only decision.
    const isAdmin = Boolean(userId) && hasAdminRole(sessionClaims);

    if (!isAdmin) {
      const { pathname } = request.nextUrl;

      // Denials only, and without identity: logging userId and role on every
      // admin request put a Clerk user ID in the log stream for ordinary
      // successful traffic (TG-001-08 / variance V12).
      console.warn('[proxy] admin route denied', {
        path: pathname,
        authenticated: Boolean(userId),
      });

      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
