// Where Google sign-in comes back to (docs/features/auth.md). Public, so it does its own checks:
// it swaps the one-time code for a session, then lets in only a login linked to an active
// member. Supabase refuses strangers itself (sign-ups are off) and says so with
// `error_code=signup_disabled`.

import { NextResponse, type NextRequest } from "next/server";
import { memberForLogin } from "@/lib/auth";
import { safeNext } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const toLogin = (error: "auth" | "not-invited") => NextResponse.redirect(`${origin}/login?error=${error}`);

  if (searchParams.get("error_code") === "signup_disabled") return toLogin("not-invited");
  const code = searchParams.get("code");
  // Cancelled at Google, or anything else Supabase reports.
  if (searchParams.get("error") || !code) return toLogin("auth");

  const supabase = await createSupabaseServerClient();
  // Fails if the code was already used (a refreshed page) or the sign-in started in another browser.
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return toLogin("auth");

  if (!(await memberForLogin(data.user.id))) {
    // Signed in to Supabase but not a member: clear the session, or /login would loop.
    await supabase.auth.signOut({ scope: "local" });
    return toLogin("not-invited");
  }
  return NextResponse.redirect(`${origin}${safeNext(searchParams.get("next"), origin)}`);
}
