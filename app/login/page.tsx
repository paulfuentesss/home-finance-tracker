import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HouseBadge } from "@/components/house-badge";
import { LoginForm } from "@/components/login-form";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "not-invited": "That account isn't invited. Ask PA to add your email in Manage — for Google, the exact address Google shows.",
  auth: "Sign-in didn't finish (cancelled, or the link was already used). Try again.",
};

// Public page (proxy.ts lets it through). Someone already signed in goes to the app.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  if (await getViewer()) redirect("/");

  return (
    // min-h-dvh (not min-h-full): the body only has a min-height, so a percentage wouldn't
    // resolve and the card would sit at the top of tall screens.
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-12">
      <div className="mb-6 flex items-center gap-3">
        <HouseBadge />
        <div>
          <h1 className="text-lg font-semibold text-amber-700">My House</h1>
          <p className="text-sm text-muted-foreground">Household bills, settled monthly.</p>
        </div>
      </div>
      <LoginForm next={typeof next === "string" ? next : "/"} error={typeof error === "string" ? ERRORS[error] : undefined} />
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Only household members PA has invited can sign in.
      </p>
    </main>
  );
}
