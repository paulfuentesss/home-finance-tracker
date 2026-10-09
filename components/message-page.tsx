import Link from "next/link";
import { HouseBadge } from "@/components/house-badge";

/** A page with nothing but a message (404, errors), framed like the login page: the My House mark above a card. */
export function MessagePage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-12">
      <Link
        href="/"
        className="mb-6 flex items-center gap-3 self-start rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HouseBadge />
        <span className="text-lg font-semibold text-amber-700">My House</span>
      </Link>
      <div className="space-y-4 rounded-xl border bg-white p-6 shadow-xs">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}
