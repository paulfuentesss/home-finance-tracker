// Where the household Gmail's script sends Meralco, Manila Water and PLDT bill emails
// (docs/features/email-bills.md; the script: scripts/gmail/bill-forwarder.gs). There's no login —
// the script can't sign in — so it checks the shared secret before anything else, then Gmail's
// verdict that the biller really sent it (lib/bill-email/intake.ts). It only ever creates a
// Pending bill or a Bill Inbox entry; PA still confirms. Retries are safe: importBillEmail
// ignores an email (or a provider's month) it already has.

import { db } from "@/db";
import { billEmailIntake, checkBillEmailSecret, dkimPassFor } from "@/lib/bill-email/intake";
import { importBillEmail } from "@/lib/bill-import";

export async function POST(request: Request) {
  const secret = process.env.BILL_EMAIL_SECRET;
  if (!secret) return Response.json({ error: "Bill emails aren't set up (BILL_EMAIL_SECRET)." }, { status: 503 });
  if (!checkBillEmailSecret(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = billEmailIntake.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "That isn't a bill email from the script." }, { status: 400 });
  const { authResults, ...email } = parsed.data;
  if (!dkimPassFor(authResults, email.from)) {
    console.warn(`Bill email not verified as sent by a biller: ${email.from} — ${email.subject}`);
    return Response.json({ error: "Not verified as sent by Meralco, Manila Water or PLDT." }, { status: 422 });
  }

  const outcome = await importBillEmail(db, email);
  return Response.json(outcome);
}
