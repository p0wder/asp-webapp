import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

// Customer routes protected by Clerk (magic link / OTP)
const isProtectedCustomerRoute = createRouteMatcher(['/my-orders(.*)']);

// Admin routes protected by NextAuth credentials
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

// Export as `proxy` — this Next.js version's middleware convention
export const proxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedCustomerRoute(request)) {
    await auth.protect();
  }

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
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
