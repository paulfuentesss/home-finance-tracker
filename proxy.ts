// Runs before every page (Next 16's name for middleware). Two jobs:
// 1. Refresh the Supabase session cookie, so logins don't expire while someone uses the app.
// 2. Send logged-out visitors to /login.
// This is a convenience, not the protection: pages and Server Actions check the signed-in
// member themselves (lib/auth.ts), so nothing depends on this file alone.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Pages anyone can open. /api/bill-email (the Gmail script) and /api/reminders (Vercel's daily
 * job) check their own shared secret.
 */
const PUBLIC_PATHS = ["/login", "/auth/", "/api/bill-email", "/api/reminders"];

function isPublic(path: string) {
  return PUBLIC_PATHS.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return new NextResponse(
      "Login isn't configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (docs/setup.md).",
      { status: 500 },
    );
  }

  // Supabase's pattern: refreshed cookies go on the request (for this render) and the response
  // (for the browser), with no-cache headers so a CDN never serves one person's session to another.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });
  // Nothing may run between creating the client and this call (Supabase's rule).
  const { data } = await supabase.auth.getClaims();

  const path = request.nextUrl.pathname;
  // Server Action calls are left to run(), which answers them properly instead of with a redirect.
  const isAction = request.method === "POST" && request.headers.has("next-action");
  if (data?.claims || isPublic(path) || isAction) return response;

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  if (path !== "/") login.searchParams.set("next", path + request.nextUrl.search);
  const redirect = NextResponse.redirect(login);
  // Keep any cookies Supabase just changed (e.g. clearing an expired session).
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}

export const config = {
  // Everything except Next's static files, images (the app icons among them), robots.txt (crawlers
  // read it signed out), and the install-the-app files: browsers fetch the manifest without
  // cookies, so a login redirect there would make the app uninstallable (docs/features/install-app.md).
  // Also the installed app's launch screen (/open): generic artwork, skipping the login check so
  // it shows at once; the navigation to "/" right after goes through here.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|sw.js|open$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
