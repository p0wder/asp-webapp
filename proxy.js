import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

/**
 * Proxy (formerly middleware) — protects admin routes.
 * Unauthenticated page requests → redirect to /login
 * Unauthenticated API requests → 401 Unauthorized
 */
export async function proxy(request) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const { pathname } = request.nextUrl;

    // API routes → return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Page routes → redirect to /login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/orders/:path*',
    '/api/ready-to-order/:path*',
    '/api/place-order/:path*',
  ],
};
