// Sends My House's emails (docs/features/reminders.md) from the household Gmail, over its SMTP
// with an app password of its own (GMAIL_SMTP_APP_PASSWORD — not the one Supabase uses for
// sign-in codes, so revoking either never breaks the other). Only this file reads it.
//
// Safety switch: localhost and the live site share one database, so a test on localhost sees
// the real housemates. Only the live site (Vercel's production) emails them; anywhere else every
// email goes to EMAIL_TEST_TO instead — or, with that unset, is only logged — and nothing is
// recorded as sent (reminder_sends), so a test never stops a real reminder.

import "server-only";
import nodemailer from "nodemailer";
import type { Email } from "@/lib/reminder-emails";

/** Whether this is the live site, which emails housemates and records what it sent. */
export function emailIsLive(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/** A full link into the app, for an email ("/periods/2026/10/settle"). */
export function appLink(path: string): string {
  // Set by Vercel: the production domain, without "https://".
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}${path}` : `http://localhost:3000${path}`;
}

export class EmailNotSetUpError extends Error {}

/** Sends one email, or throws. `toName` labels a redirected test email ("[test → Ben]"). */
export async function sendEmail(to: string, toName: string, email: Email): Promise<void> {
  let recipient = to;
  let subject = email.subject;
  if (!emailIsLive()) {
    const testTo = process.env.EMAIL_TEST_TO;
    if (!testTo) {
      console.info(`[email not sent: not the live site, EMAIL_TEST_TO is unset] to ${toName}: ${subject}`);
      return;
    }
    recipient = testTo;
    subject = `[test → ${toName}] ${subject}`;
  }

  const user = process.env.GMAIL_SMTP_USER;
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD;
  if (!user || !pass) {
    throw new EmailNotSetUpError("Email isn't set up (GMAIL_SMTP_USER / GMAIL_SMTP_APP_PASSWORD).");
  }
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transport.sendMail({
    from: { name: "My House", address: user },
    // Replies come back to the household Gmail, which the admin checks.
    to: recipient,
    subject,
    text: email.text,
  });
}
