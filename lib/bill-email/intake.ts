// What the bill-email route (app/api/bill-email/route.ts) checks before importing an email the
// household Gmail's script sent (docs/features/email-bills.md). Pure, so it's unit-tested.
//
// The route has no login — the script can't sign in — so two things stand in for one:
// - a long random shared secret, known only to the app and the script (lib/bearer-secret.ts), and
// - Gmail's own verdict that the email really is from the biller: the topmost
//   Authentication-Results header, which Gmail's receiving server adds when the email arrives
//   in the household mailbox (a sender can't forge a header above it).

import { z } from "zod";
import { isDomainOrSubdomain, providerDomain, providerOf } from "@/lib/bill-email/parse";

/** What the script POSTs: a BillEmail plus Gmail's Authentication-Results header. */
export const billEmailIntake = z.object({
  messageId: z.string().trim().min(1).max(998),
  from: z.string().trim().min(1).max(998),
  subject: z.string().max(998),
  receivedAt: z.iso.datetime(),
  // Bills' plain-text bodies are a few KB; the cap keeps a stray huge email out.
  text: z.string().max(200_000),
  authResults: z.string().max(20_000),
});

export type BillEmailIntake = z.infer<typeof billEmailIntake>;

/**
 * True when Gmail (authserv-id `mx.google.com`) reports a DKIM pass signed by the domain of the
 * biller the email claims to be from. Each `dkim=` result is judged on its own: a pass for a
 * mailing service next to a fail for the biller isn't enough.
 */
export function dkimPassFor(authResults: string, from: string): boolean {
  const provider = providerOf(from);
  if (!provider) return false;
  const domain = providerDomain(provider);
  const unfolded = authResults
    .replace(/^\s*Authentication-Results:\s*/i, "")
    .replace(/\([^)]*\)/g, " ") // comments, e.g. "(google.com: domain of … designates …)"
    .replace(/\s+/g, " ");
  const [servId, ...results] = unfolded.split(";").map((part) => part.trim());
  // "authserv-id [version]" — only the id matters.
  if (servId.split(" ")[0].toLowerCase() !== "mx.google.com") return false;
  return results.some((result) => {
    if (!/^dkim=pass\b/i.test(result)) return false;
    const signer =
      result.match(/\bheader\.d=([^\s;]+)/i)?.[1] ?? result.match(/\bheader\.i=[^\s@;]*@([^\s;]+)/i)?.[1];
    return signer !== undefined && isDomainOrSubdomain(signer, domain);
  });
}
