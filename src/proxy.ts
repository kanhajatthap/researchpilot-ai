import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js 16 Network Edge Boundary & Security Proxy (formerly middleware.ts)
 * 100% Free - intercepts requests at the network edge before page rendering.
 *
 * 1. Checks authentication session cookie (rp_session).
 * 2. Redirects logged-in users away from /login & /register.
 * 3. Injects enterprise security headers (Clickjacking, XSS, Referrer policy).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('rp_session')?.value;

  // 1. If already logged in, redirect away from auth forms (/login, /register)
  if (sessionToken && (pathname === '/login' || pathname === '/register')) {
    const dashboardUrl = new URL('/', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // 2. Prepare response with enterprise security headers
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
     * - api routes (/api/*)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     * - image assets (.png, .jpg, .svg, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico)).*)',
  ],
};
