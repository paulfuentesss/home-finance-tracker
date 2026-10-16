import { LaunchRedirect } from "@/components/launch-redirect";

// The installed app's start page (start_url in app/manifest.ts, docs/features/install-app.md).
// Static and public (proxy.ts skips it), so it arrives at once and replaces the phone's own
// start-up screen; it stays up, animating, while LaunchRedirect loads the month behind it.
// Generic artwork only: it never loads data or the login (lib/actions-guard.test.ts).
export default function LaunchPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="launch-in flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- app/icon.svg, served by Next as is */}
        <img src="/icon.svg" width={72} height={72} alt="" fetchPriority="high" />
        <p className="text-lg font-semibold text-amber-700">My House</p>
      </div>
      <div className="launch-track mt-6" aria-hidden />
      <LaunchRedirect />
    </main>
  );
}
