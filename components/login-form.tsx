"use client";

import { useEffect, useState, useTransition } from "react";
import { sendEmailCode, signInWithGoogle, verifyEmailCode, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Digits in a sign-in code (Supabase → Email OTP length). */
const CODE_LENGTH = 6;
/** Supabase sends one email per person per minute (SMTP "minimum interval per user"). */
const RESEND_SECONDS = 60;

/**
 * Two ways in: Google, or a code emailed to an invited address (for anyone without a Google
 * account). Forms submit through onSubmit + startTransition, like the rest of the app, so a
 * failed try keeps what was typed. At most one orange (primary) button per step; the Google
 * button stays white, per Google's branding rules.
 */
export function LoginForm({ next, error }: { next: string; error?: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LoginState | null>(error ? { ok: false, error } : null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [cooldown, setCooldown] = useState(0);

  // Counts the resend wait down to 0.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const run = (action: () => Promise<LoginState | void>, onOk?: (r: LoginState) => void) =>
    startTransition(async () => {
      const r = await action();
      // A successful sign-in redirects and returns nothing.
      if (!r) return;
      setResult(r.ok ? null : r);
      if (r.ok) onOk?.(r);
    });

  const sendCode = (onSent?: () => void) =>
    run(
      () => sendEmailCode(email),
      () => {
        setCooldown(RESEND_SECONDS);
        onSent?.();
      },
    );
  const verify = (value: string) => run(() => verifyEmailCode(email, value, next));

  return (
    <div className="space-y-6 rounded-xl border bg-white p-6 shadow-xs">
      <Button
        variant="outline"
        size="lg"
        className="h-10 w-full gap-2.5 bg-white text-[15px] font-medium text-zinc-800 hover:bg-zinc-50"
        disabled={pending}
        onClick={() => run(() => signInWithGoogle(next))}
      >
        <GoogleLogo />
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        No Google account?
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Each step has its own key: without it React reuses the email <input> for the code,
          which keeps the typed email in the code box. */}
      {step === "email" ? (
        <form
          key="email-step"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            sendCode(() => {
              setCode("");
              setStep("code");
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Get a sign-in code by email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send code"}
          </Button>
        </form>
      ) : (
        <form
          key="code-step"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            verify(code);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="code">Enter the {CODE_LENGTH}-digit code</Label>
            <p id="code-help" className="text-xs text-muted-foreground">
              If <span className="font-medium break-all text-foreground">{email}</span> is invited, a code is on its
              way (it works for 10 minutes). Check your inbox — also <strong>Promotions</strong> and{" "}
              <strong>Spam</strong>.
            </p>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              aria-describedby="code-help"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
                setCode(digits);
                // Signs in by itself once the code is complete (typed or pasted).
                if (digits.length === CODE_LENGTH && code.length !== CODE_LENGTH && !pending) verify(digits);
              }}
              // Dots, not zeros: the code font draws a slashed zero, which reads like "Ø".
              placeholder={"•".repeat(CODE_LENGTH)}
              className="h-12 text-center font-mono text-2xl tracking-[0.5em] placeholder:text-zinc-300"
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending || code.length !== CODE_LENGTH}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <div className="flex justify-between gap-3 text-sm">
            <button
              type="button"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:no-underline disabled:opacity-60"
              disabled={pending || cooldown > 0}
              onClick={() => sendCode(() => setResult({ ok: true, message: "New code sent. Use the newest email." }))}
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
            <button
              type="button"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                setStep("email");
                setResult(null);
              }}
            >
              Use a different email
            </button>
          </div>
        </form>
      )}

      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </div>
  );
}

/** Google's four-colour "G", as its sign-in branding asks. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
