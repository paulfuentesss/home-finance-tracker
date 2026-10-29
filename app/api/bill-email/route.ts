// Where the household Gmail's script sends Meralco, Manila Water and PLDT bill emails
// (docs/features/email-bills.md; the script: scripts/gmail/bill-forwarder.gs). There's no login —
// the script can't sign in — so it checks the shared secret before anything else, then Gmail's
// verdict that the biller really sent it — DKIM, DMARC, or for a forwarded bill ARC sealed by
// Google (lib/bill-email/intake.ts). It only ever creates a
// Pending bill or a Bill Inbox entry; PA still confirms. Retries are safe: importBillEmail
// ignores an email (or a provider's month) it already has. A new one pushes to PA after the
// response (docs/features/notifications.md), so the script never waits on it.

import { desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { billEmails, billingPeriods, db } from "@/db";
import { checkBearerSecret } from "@/lib/bearer-secret";
import { billEmailIntake, sentByBiller } from "@/lib/bill-email/intake";
import { importBillEmail, type ImportOutcome } from "@/lib/bill-import";
import { BILL_EMAIL_COLUMNS } from "@/lib/household-config";
import { pushToAdmin } from "@/lib/push";
import { billArrivedPush, billEmailStuckPush } from "@/lib/push-messages";

export async function POST(request: Request) {
  const secret = process.env.BILL_EMAIL_SECRET;
  if (!secret) return Response.json({ error: "Bill emails aren't set up (BILL_EMAIL_SECRET)." }, { status: 503 });
  if (!checkBearerSecret(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = billEmailIntake.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "That isn't a bill email from the script." }, { status: 400 });
  const { authResults, arcSeals, ...email } = parsed.data;
  if (!sentByBiller(authResults, email.from, arcSeals)) {
    console.warn(`Bill email not verified as sent by a biller: ${email.from} — ${email.subject}`);
    return Response.json({ error: "Not verified as sent by Meralco, Manila Water or PLDT." }, { status: 422 });
  }

  const outcome = await importBillEmail(db, email);
  after(() => pushOutcome(outcome));
  return Response.json(outcome);
}

/** Tells PA a new bill is in (to confirm), or that one needs a look in the Bill inbox (on Manage). */
async function pushOutcome(outcome: ImportOutcome) {
  try {
    if (outcome.kind === "duplicate") return;
    const row = await db.query.billEmails.findFirst({ where: eq(billEmails.id, outcome.emailId) });
    if (!row) return;
    if (outcome.kind === "imported" && row.provider && row.billYear && row.billMonth) {
      const bill = BILL_EMAIL_COLUMNS[row.provider];
      await pushToAdmin(billArrivedPush({ bill, year: row.billYear, month: row.billMonth }));
      return;
    }
    // The inbox is on every month's Manage; the latest month always exists (the bill's may not have started).
    const [latest] = await db
      .select({ year: billingPeriods.year, month: billingPeriods.month })
      .from(billingPeriods)
      .orderBy(desc(billingPeriods.year), desc(billingPeriods.month))
      .limit(1);
    await pushToAdmin(billEmailStuckPush({ path: latest ? `/periods/${latest.year}/${latest.month}/manage` : "/" }));
  } catch (error) {
    console.error("Couldn't push about a bill email", error);
  }
}
