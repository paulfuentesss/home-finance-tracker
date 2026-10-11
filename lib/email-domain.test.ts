// lib/email-domain.ts with a fake DNS: only a definite "no" may block an invite.

import { describe, expect, it, vi } from "vitest";
import { domainTakesMail, type MailResolver } from "./email-domain";

const dnsError = (code: string) => Object.assign(new Error(code), { code });

function fake(over: Partial<Record<keyof MailResolver, () => Promise<unknown>>>): MailResolver {
  const none = () => Promise.reject(dnsError("ENODATA"));
  return {
    resolveMx: vi.fn(over.resolveMx ?? none),
    resolve4: vi.fn(over.resolve4 ?? none),
    resolve6: vi.fn(over.resolve6 ?? none),
  } as MailResolver;
}

describe("domainTakesMail", () => {
  it("is yes when the domain has a mail server, and looks up only the part after the @", async () => {
    const resolver = fake({ resolveMx: async () => [{ exchange: "mx.example.com", priority: 10 }] });
    expect(await domainTakesMail("someone@example.com", resolver)).toBe("yes");
    expect(resolver.resolveMx).toHaveBeenCalledWith("example.com");
  });

  it("is no when the domain doesn't exist (a typo after the @)", async () => {
    const resolver = fake({ resolveMx: () => Promise.reject(dnsError("ENOTFOUND")) });
    expect(await domainTakesMail("someone@exmaple.com", resolver)).toBe("no");
    // No address lookups after that: some routers are slow to answer them for missing domains.
    expect(resolver.resolve4).not.toHaveBeenCalled();
  });

  it("is no when the domain says it takes no mail (null MX)", async () => {
    const resolver = fake({ resolveMx: async () => [{ exchange: "", priority: 0 }] });
    expect(await domainTakesMail("someone@example.com", resolver)).toBe("no");
  });

  it("is yes when there's no mail server but the domain has an address", async () => {
    expect(await domainTakesMail("someone@example.com", fake({ resolve6: async () => ["::1"] }))).toBe("yes");
  });

  it("is no when the domain has neither a mail server nor an address", async () => {
    expect(await domainTakesMail("someone@example.com", fake({}))).toBe("no");
  });

  it("is unknown (lets the invite through) when DNS times out or fails", async () => {
    const timeout = () => Promise.reject(dnsError("ETIMEOUT"));
    expect(await domainTakesMail("someone@example.com", fake({ resolveMx: timeout }))).toBe("unknown");
    expect(await domainTakesMail("someone@example.com", fake({ resolve4: timeout }))).toBe("unknown");
  });
});
