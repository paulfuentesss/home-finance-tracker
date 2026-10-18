// Called each morning by Vercel's cron (vercel.json → crons) to send the month-end reminders
// and the "still unpaid" follow-ups (docs/features/reminders.md). There's no login — Vercel
// can't sign in — so it checks the shared secret before anything else: Vercel sends CRON_SECRET
// as a Bearer token. Running it twice is safe: each reminder is claimed before it's sent
// (lib/reminder-send.ts). Each run ends with a ping to the health-check service, so the admin
// hears when a morning's run fails or never happens (lib/health-ping.ts).

import { checkBearerSecret } from "@/lib/bearer-secret";
import { emailIsLive } from "@/lib/email";
import { todayInManila } from "@/lib/format";
import { healthPingPath } from "@/lib/health-ping";
import { runDailyReminders, type ReminderOutcome } from "@/lib/reminder-send";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Reminders aren't set up (CRON_SECRET)." }, { status: 503 });
  if (!checkBearerSecret(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // For trying each reminder on localhost (?today=2026-10-31); the live site always uses today.
  const asked = new URL(request.url).searchParams.get("today");
  const today = !emailIsLive() && asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : todayInManila();
  let outcome: ReminderOutcome;
  try {
    outcome = await runDailyReminders(today);
  } catch (error) {
    await pingHealthCheck("threw");
    throw error;
  }
  await pingHealthCheck(outcome);
  return Response.json(outcome);
}

/**
 * Tells the health-check service how the run went. Only from the live site (localhost shares the
 * database but isn't the daily job), and only when HEALTHCHECK_URL is set. A plain GET with no
 * body: the outcome holds names, which stay here. A ping that fails is logged, never the run's
 * problem — a missed ping makes the service alert anyway.
 */
async function pingHealthCheck(run: Parameters<typeof healthPingPath>[0]) {
  const url = process.env.HEALTHCHECK_URL;
  if (!url || !emailIsLive()) return;
  try {
    await fetch(url.replace(/\/+$/, "") + healthPingPath(run), { signal: AbortSignal.timeout(5000) });
  } catch (error) {
    console.error("Couldn't ping the health check", error);
  }
}
