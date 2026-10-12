// Called once a day by Vercel's cron (vercel.json → crons, 09:00 Manila) to send the month-end
// reminders (docs/features/reminders.md). There's no login — Vercel can't sign in — so it checks
// the shared secret before anything else: Vercel sends CRON_SECRET as a Bearer token. Running it
// twice is safe: each reminder is claimed before it's sent (lib/reminder-send.ts).

import { checkBearerSecret } from "@/lib/bearer-secret";
import { emailIsLive } from "@/lib/email";
import { todayInManila } from "@/lib/format";
import { runDailyReminders } from "@/lib/reminder-send";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Reminders aren't set up (CRON_SECRET)." }, { status: 503 });
  if (!checkBearerSecret(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // For trying each reminder on localhost (?today=2026-10-31); the live site always uses today.
  const asked = new URL(request.url).searchParams.get("today");
  const today = !emailIsLive() && asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : todayInManila();
  return Response.json(await runDailyReminders(today));
}
