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

/** What the script POSTs: a BillEmail plus Gmail's Authentication-Results and ARC-Seal headers. */
export const billEmailIntake = z.object({
  messageId: z.string().trim().min(1).max(998),
  from: z.string().trim().min(1).max(998),
  subject: z.string().max(998),
  receivedAt: z.iso.datetime(),
  // Bills' plain-text bodies are a few KB; the cap keeps a stray huge email out.
  text: z.string().max(200_000),
  authResults: z.string().max(20_000),
  // Every ARC-Seal header (one per mail server that sealed it on the way). Optional: script
  // copies from before 2026-10-30 don't send them.
  arcSeals: z.array(z.string().max(20_000)).max(20).default([]),
});

export type BillEmailIntake = z.infer<typeof billEmailIntake>;

/** One `method=result …` part of the header: its words outside comments, and its comments. */
interface AuthResult {
  text: string;
  comments: string[];
}

/**
 * The header split into its `;`-separated parts, or null when it can't be read for certain.
 * Quoted strings are dropped and comments set aside, so neither can pass for a result. The SPF
 * part repeats the sender's MAIL FROM address, which a sender chooses: a quoted one like
 * `"a)b; dkim=pass header.d=meralco.com.ph"@evil.test` could otherwise close a comment early
 * and plant a result. So a `;`, `(`, `"` or `\` inside a comment, a `;`, `(`, `)` or `\` inside
 * a quoted string, a stray `)` or anything left open makes the whole header unreadable. Gmail's
 * own headers never have those.
 */
export function resultsOf(header: string): AuthResult[] | null {
  const results: AuthResult[] = [];
  let state: "text" | "quote" | "comment" = "text";
  let text = "";
  let comment = "";
  let comments: string[] = [];
  for (const char of header.replace(/^\s*Authentication-Results:\s*/i, "")) {
    if (state === "quote") {
      if (char === '"') state = "text";
      else if (';()\\'.includes(char)) return null;
    } else if (state === "comment") {
      if (char === ")") {
        comments.push(comment.trim());
        comment = "";
        text += " ";
        state = "text";
      } else if (';("\\'.includes(char)) return null;
      else comment += char;
    } else if (char === '"') state = "quote";
    else if (char === "(") state = "comment";
    else if (char === ")" || char === "\\") return null;
    else if (char === ";") {
      results.push({ text: text.replace(/\s+/g, " ").trim(), comments });
      text = "";
      comments = [];
    } else text += char;
  }
  if (state !== "text") return null;
  results.push({ text: text.replace(/\s+/g, " ").trim(), comments });
  return results;
}

/**
 * A `k=v; k=v` tag list (an ARC-Seal header), keys lower-cased; values split at the first `=`.
 * Null when a tag appears twice (`d=evil.test; … d=google.com`), which makes a seal invalid.
 */
export function tagsOf(header: string): Map<string, string> | null {
  const tags = new Map<string, string>();
  for (const part of header.replace(/^\s*ARC-Seal:\s*/i, "").split(";")) {
    const at = part.indexOf("=");
    if (at <= 0) continue;
    const key = part.slice(0, at).trim().toLowerCase();
    if (tags.has(key)) return null;
    tags.set(key, part.slice(at + 1).trim());
  }
  return tags;
}

/**
 * True when Gmail (authserv-id `mx.google.com`) reports that the biller the email claims to be
 * from really sent it, by any of:
 * - **DKIM**: a pass signed by the biller's domain. Each `dkim=` result is judged on its own: a
 *   pass for a mailing service next to a fail for the biller isn't enough.
 * - **DMARC**: a pass for the biller's domain. DMARC passes only when SPF or DKIM lines up with
 *   the From domain — how Meralco passes: it signs through Salesforce, but sends from its own
 *   bounce address.
 * - **ARC sealed by Google**, for bills forwarded from PA's personal Gmail. Forwarding breaks
 *   SPF, so the My House Gmail's own DMARC fails; but Gmail's `arc=pass (i=N … dmarc=pass
 *   fromdomain=…)` summary carries the verdict from where the bill first arrived. It counts
 *   only when the ARC-Seal with that `i=N` was sealed by google.com: `arc=pass` means Gmail
 *   checked every seal, so that verdict is Google's own. A forged email with a sender's own ARC
 *   set on top is summarised at that set, which Google didn't seal.
 *
 * What's left (as before): someone forwarding their own real bill from the same biller. It would
 * still only be a Pending bill, which PA confirms.
 */
export function sentByBiller(authResults: string, from: string, arcSeals: readonly string[] = []): boolean {
  const provider = providerOf(from);
  if (!provider) return false;
  const domain = providerDomain(provider);
  const results = resultsOf(authResults);
  if (!results) return false;
  const [servId, ...rest] = results;
  // "authserv-id [version]" — only the id matters.
  if (servId.text.split(" ")[0].toLowerCase() !== "mx.google.com") return false;
  return rest.some(({ text, comments }) => {
    if (/^dkim=pass\b/i.test(text)) {
      const signer =
        text.match(/\bheader\.d=([^\s;]+)/i)?.[1] ?? text.match(/\bheader\.i=[^\s@;]*@([^\s;]+)/i)?.[1];
      return signer !== undefined && isDomainOrSubdomain(signer, domain);
    }
    if (/^dmarc=pass\b/i.test(text)) {
      const froms = [...text.matchAll(/\bheader\.from=(\S+)/gi)];
      return froms.length === 1 && isDomainOrSubdomain(froms[0][1], domain);
    }
    if (/^arc=pass\b/i.test(text)) return arcPassFor(comments[0], domain, arcSeals);
    return false;
  });
}

/** Gmail's `arc=pass (…)` summary says `domain` passed DMARC, under a set google.com sealed. */
function arcPassFor(summary: string | undefined, domain: string, arcSeals: readonly string[]): boolean {
  if (summary === undefined) return false;
  const tokens = summary.split(/\s+/).filter(Boolean);
  if (!tokens.every((token) => /^[a-z][\w.-]*=\S+$/i.test(token))) return false;
  const only = (key: string) => {
    const values = tokens.filter((t) => t.toLowerCase().startsWith(`${key}=`)).map((t) => t.slice(key.length + 1));
    return values.length === 1 ? values[0] : null;
  };
  const instance = only("i");
  const dmarc = only("dmarc");
  const fromDomain = only("fromdomain");
  if (instance === null || !/^[1-9]\d*$/.test(instance)) return false;
  if (dmarc?.toLowerCase() !== "pass" || fromDomain === null || !isDomainOrSubdomain(fromDomain, domain)) return false;
  const all = arcSeals.map(tagsOf);
  if (all.some((tags) => tags === null)) return false;
  const seals = all.filter((tags) => tags?.get("i") === instance);
  return seals.length === 1 && seals[0]?.get("d")?.toLowerCase() === "google.com";
}
