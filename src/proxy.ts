import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js 16 Edge Proxy & Security Barrier (formerly middleware.ts)
 * 100% Free - Enforces strict authentication across the entire platform.
 *
 * Rule: Nobody can access the research platform without logging in.
 *
 * 1. Public Pages: /login, /register, /forgot-password, /reset-password, /architecture
 * 2. Protected Pages: /, /documents, /compare, /sources, /history, /settings
 *    -> Redirects unauthenticated visitors immediately to /login.
 * 3. Logged-in Users:
 *    -> Redirects away from /login and /register back to / (Dashboard).
 * 4. Enterprise Security Headers: Injected on all HTTP responses.
 */

const PUBLIC_PAGE_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/architecture',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('rp_session')?.value;

  const isPublicPage = PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  // 1. Unauthenticated users trying to access protected routes -> Redirect to /login
  if (!sessionToken && !isPublicPage) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('from', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 2. Already logged-in users trying to access /login or /register -> Redirect to /
  if (sessionToken && (pathname === '/login' || pathname === '/register')) {
    const dashboardUrl = new URL('/', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // 3. Inject enterprise security headers on all responses
  const response = NextResponse.next();

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('X-ResearchPilot-Engine', 'active');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - API routes (/api/*)
     * - _next/static (static client bundles)
     * - _next/image (image optimization pipeline)
     * - favicon.ico, sitemap.xml, robots.txt
     * - image / font assets (.png, .jpg, .svg, .woff2, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)).*)',
  ],
};
