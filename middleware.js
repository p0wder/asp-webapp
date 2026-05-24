import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

// Customer routes that require a Clerk session
const isProtectedCustomerRoute = createRouteMatcher(['/my-orders(.*)']);

// Admin routes that require a NextAuth session
const isAdminRoute = createRouteMatcher([
  '/orders(.*)',
  '/quotes(.*)',
  '/api/ready-to-order(.*)',
  '/api/quotes(.*)',
  '/api/place-order(.*)',
  '/api/printavo-status-update(.*)',
  '/api/orders-partial-state(.*)',
  '/api/ss-catalog-lookup(.*)',
  '/api/payment-profiles(.*)',
  '/api/search-products(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  // Customer routes: require Clerk session, redirect to /account/login if absent.
  // Configure NEXT_PUBLIC_CLERK_SIGN_IN_URL=/account/login in Vercel env vars.
  if (isProtectedCustomerRoute(request)) {
    await auth.protect();
  }

  // Admin routes: require NextAuth session (existing admin auth is unchanged).
  if (isAdminRoute(request)) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
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
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
