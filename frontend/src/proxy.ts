/**
 * proxy.ts — Next.js 16 route protection via Supabase session.
 *
 * In Next.js 16 the file is named proxy.ts (was middleware.ts in ≤15).
 * The exported function is named `proxy` (was `middleware`).
 *
 * Behaviour:
 *  - Public routes (/, /auth/*, _next/*, public assets) pass through.
 *  - Protected routes require a valid Supabase session cookie.
 *  - Unauthenticated requests to protected routes → redirect to /auth/signin.
 *  - Already-authenticated users hitting /auth/* → redirect to /home.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/", "/auth/signin", "/auth/signup"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Static/internal Next.js paths
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||       // not used — backend is separate
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/public/")
  ) return true;
  return false;
}

function isAuthPage(pathname: string): boolean {
  return pathname.startsWith("/auth/");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Build a mutable response so Supabase can refresh cookies if needed
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Create a Supabase client that can read/write cookies on this response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session (rotates short-lived tokens if needed)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && isAuthPage(pathname)) {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  // Allow public paths through without auth check
  if (isPublic(pathname)) return response;

  // Protect all other routes
  if (!isAuthenticated) {
    const signIn = new URL("/auth/signin", request.url);
    signIn.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(signIn);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - /images/ (public folder assets)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|images/).*)",
  ],
};
