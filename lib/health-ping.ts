// The daily job's "I'm alive" signal (docs/operations.md → Emails & reminders). A free
// health-check service (healthchecks.io) expects one ping a day from /api/reminders. A ping to
// its /fail address, or no ping by the deadline, makes the service email the admin — from
// outside the household Gmail, so the alert still arrives when Gmail (or the database) is what
// broke. Pure: the route does the sending.

import type { ReminderOutcome } from "@/lib/reminder-send";

/**
 * What to add to the ping URL after a run: "" when it finished and every email went, "/fail"
 * when one couldn't be sent or the run itself threw. A month that couldn't start (a waiting
 * payment, say) isn't a failure: the admin is already emailed why.
 */
export function healthPingPath(run: Pick<ReminderOutcome, "failed"> | "threw"): "" | "/fail" {
  return run === "threw" || run.failed.length > 0 ? "/fail" : "";
}
