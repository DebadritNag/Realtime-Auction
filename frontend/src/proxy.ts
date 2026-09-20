/**
 * proxy.ts — Next.js 16 (was middleware.ts in ≤15)
 *
 * This proxy ONLY handles session cookie refreshing so Supabase tokens
 * stay valid on the server side. It does NOT perform route-based redirects.
 *
 * Route protection is handled client-side by AppShell.tsx:
 *  - Unauthenticated → redirected to /auth/signin?redirectTo=...
 *  - Already-authenticated visiting /auth/* → redirected to /home
 *
 * Keeping redirects client-side avoids the race between the browser
 * writing the Supabase session cookie and the Edge proxy reading it.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  // Build a mutable response so Supabase can write refreshed session cookies
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

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

  // Refresh the session — this rotates tokens and writes fresh cookies
  // onto the response. We don't make routing decisions here.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Run on all routes except static assets
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|images/).*)",
  ],
};
