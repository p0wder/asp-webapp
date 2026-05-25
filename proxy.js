import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Customer routes protected by Clerk (magic link / OTP / OAuth)
const isProtectedCustomerRoute = createRouteMatcher(['/my-orders(.*)']);

// Admin routes protected by Clerk with role: admin
const isAdminRoute = createRouteMatcher([
  '/purchasing(.*)',
  '/pipeline(.*)',
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
]);

export const proxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedCustomerRoute(request)) {
    await auth.protect();
  }

  if (isAdminRoute(request)) {
    const { userId, sessionClaims } = await auth();
    const isAdmin = userId && sessionClaims?.role === 'admin';

    console.log('[proxy] admin route check', {
      path: request.nextUrl.pathname,
      userId,
      role: sessionClaims?.role,
      isAdmin,
    });

    if (!isAdmin) {
      const { pathname } = request.nextUrl;

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
