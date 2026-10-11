// Catches a mistyped email domain (e.g. an extra word after the @) before a housemate is
// invited: inviting sends no email, so a typo would otherwise only show when their sign-in
// code never arrives. Asks DNS whether the domain takes mail.
//
// Only a definite "no" blocks the invite. A slow or failing DNS lookup lets it through, so a
// network hiccup never stops PA from inviting someone.

import { Resolver } from "node:dns/promises";

/** The DNS lookups used here (a fake in the tests). */
export interface MailResolver {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

/** "no" only when DNS says the domain doesn't exist or takes no mail. */
export async function domainTakesMail(email: string, resolver: MailResolver = defaultResolver()): Promise<"yes" | "no" | "unknown"> {
  const domain = email.slice(email.lastIndexOf("@") + 1);
  try {
    const mx = await resolver.resolveMx(domain);
    // A single empty MX ("null MX", RFC 7505) means the domain says it accepts no mail.
    if (mx.length === 1 && (mx[0].exchange === "" || mx[0].exchange === ".")) return "no";
    if (mx.length > 0) return "yes";
  } catch (error) {
    if (codeOf(error) === "ENOTFOUND") return "no"; // the domain doesn't exist
    if (codeOf(error) !== "ENODATA") return "unknown";
  }
  // The domain exists but has no MX record: mail goes to its own address, if it has one (RFC 5321).
  for (const lookup of [resolver.resolve4, resolver.resolve6]) {
    try {
      if ((await lookup.call(resolver, domain)).length > 0) return "yes";
    } catch (error) {
      if (codeOf(error) !== "ENODATA" && codeOf(error) !== "ENOTFOUND") return "unknown";
    }
  }
  return "no";
}

/** ENOTFOUND: the domain doesn't exist. ENODATA: it exists but has no record of that type. */
const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

function defaultResolver(): MailResolver {
  // A timeout returns "unknown" straight away, so saving waits at most a few seconds.
  return new Resolver({ timeout: 3000, tries: 1 });
}
