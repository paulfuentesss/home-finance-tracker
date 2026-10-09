"use server";

// Sign-in and sign-out (docs/features/auth.md). These are the only public Server Actions — they
// can't use run(), which requires someone signed in — so each one validates its own input and
// never reveals data. Sign-ups are off in Supabase: only invited emails have a login.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { memberForLogin } from "@/lib/auth";
import { safeNext } from "@/lib/permissions";
import { PREVIEW_COOKIE } from "@/lib/preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { ok: true; message?: string } | { ok: false; error: string };

const NOT_INVITED = "That account isn't invited. Ask the admin to add your email in Manage.";
const TOO_MANY = "Too many tries — wait a minute, then try again.";

/** This site's origin, e.g. http://localhost:3000 (Next checks a Server Action's Origin against its Host). */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
}

function isRateLimited(error: { status?: number; code?: string }) {
  return error.status === 429 || Boolean(error.code?.startsWith("over_"));
}

/** Starts "Continue with Google": sends the browser to Google, which comes back to /auth/callback. */
export async function signInWithGoogle(next: string): Promise<LoginState> {
  const origin = await requestOrigin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(next, origin))}`,
      // Always ask which Google account, so someone on the wrong one can switch.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error(error);
    return { ok: false, error: "Couldn't start Google sign-in — try again." };
  }
  redirect(data.url);
}

const emailField = z.string().trim().toLowerCase().pipe(z.email("Enter an email like name@example.com"));

/**
 * Emails a sign-in code. The page never says whether an email is invited: unknown ones get the
 * same answer, and Supabase sends nothing to them (sign-ups are off).
 */
export async function sendEmailCode(rawEmail: string): Promise<LoginState> {
  const parsed = emailField.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: false } });
  if (!error || error.code === "otp_disabled" || error.code === "signup_disabled") {
    return { ok: true, message: "If that email is invited, a sign-in code is on its way. It works for 10 minutes." };
  }
  if (isRateLimited(error)) return { ok: false, error: TOO_MANY };
  console.error(error);
  return { ok: false, error: "Couldn't send the code — try again later." };
}

/** Signs in with the emailed code, then goes to `next`. */
export async function verifyEmailCode(rawEmail: string, rawCode: string, next: string): Promise<LoginState> {
  const email = emailField.safeParse(rawEmail);
  const code = z
    .string()
    .trim()
    .regex(/^\d{6,10}$/, "Enter the code from the email (numbers only)")
    .safeParse(rawCode);
  if (!email.success) return { ok: false, error: email.error.issues[0].message };
  if (!code.success) return { ok: false, error: code.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: "email" });
  if (error || !data.user) {
    if (error && isRateLimited(error)) return { ok: false, error: TOO_MANY };
    return { ok: false, error: "That code is wrong or expired. Check the latest email, or send a new code." };
  }
  // A login that matches no member (e.g. left over from someone removed) gets nothing.
  if (!(await memberForLogin(data.user.id))) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, error: NOT_INVITED };
  }
  (await cookies()).delete(PREVIEW_COOKIE); // a fresh sign-in starts in PA's own view
  const origin = await requestOrigin();
  redirect(`${origin}${safeNext(next, origin)}`);
}

/** Signs out on this device only, ending any "Preview as a housemate" too. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(PREVIEW_COOKIE);
  redirect("/login");
}
