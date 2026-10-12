import { describe, expect, it } from "vitest";
import { billEmailIntake, dkimPassFor } from "@/lib/bill-email/intake";

// The shape of Gmail's header (made-up selectors and signatures).
const gmail = (dkim: string) =>
  `mx.google.com;\r\n       ${dkim};\r\n       spf=pass (google.com: domain of x@y designates 1.2.3.4 as permitted sender) smtp.mailfrom=bounce@mailer.example;\r\n       dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=meralco.com.ph`;

// The shared secret is checked by checkBearerSecret (lib/bearer-secret.test.ts).

describe("dkimPassFor", () => {
  it("accepts a DKIM pass signed by the biller's domain, for each biller", () => {
    expect(dkimPassFor(gmail("dkim=pass header.i=@meralco.com.ph header.s=s1 header.b=abc"), "customercare@meralco.com.ph")).toBe(true);
    expect(dkimPassFor(gmail("dkim=pass header.i=@manilawater.com header.s=s1 header.b=abc"), "ETAXFORMS@MANILAWATER.COM")).toBe(true);
    expect(dkimPassFor(gmail("dkim=pass header.d=pldt.com.ph header.s=s1"), "PLDT <pldthome@pldt.com.ph>")).toBe(true);
  });

  it("accepts a signer that is a subdomain of the biller, and the header name in front", () => {
    expect(dkimPassFor(`Authentication-Results: ${gmail("dkim=pass header.i=@email.meralco.com.ph")}`, "customercare@meralco.com.ph")).toBe(true);
  });

  it("refuses a failed signature, or none", () => {
    expect(dkimPassFor(gmail("dkim=fail header.i=@meralco.com.ph"), "customercare@meralco.com.ph")).toBe(false);
    expect(dkimPassFor(gmail("dkim=none"), "customercare@meralco.com.ph")).toBe(false);
    expect(dkimPassFor("", "customercare@meralco.com.ph")).toBe(false);
  });

  it("refuses a pass for some other domain, even next to the biller's fail", () => {
    expect(dkimPassFor(gmail("dkim=pass header.i=@mailer.example"), "customercare@meralco.com.ph")).toBe(false);
    expect(
      dkimPassFor(gmail("dkim=pass header.i=@mailer.example; dkim=fail header.i=@meralco.com.ph"), "customercare@meralco.com.ph"),
    ).toBe(false);
  });

  it("refuses lookalike signers and senders", () => {
    expect(dkimPassFor(gmail("dkim=pass header.i=@meralco.com.ph.evil.test"), "customercare@meralco.com.ph")).toBe(false);
    expect(dkimPassFor(gmail("dkim=pass header.i=@notmeralco.com.ph"), "customercare@meralco.com.ph")).toBe(false);
    expect(dkimPassFor(gmail("dkim=pass header.i=@meralco.com.ph.evil.test"), "x@meralco.com.ph.evil.test")).toBe(false);
  });

  it("refuses a pass for one biller on an email claiming to be from another", () => {
    expect(dkimPassFor(gmail("dkim=pass header.i=@pldt.com.ph"), "customercare@meralco.com.ph")).toBe(false);
  });

  it("refuses a header that Gmail didn't write", () => {
    expect(dkimPassFor(gmail("dkim=pass header.i=@meralco.com.ph").replace("mx.google.com", "mx.evil.test"), "customercare@meralco.com.ph")).toBe(false);
  });

  it("refuses senders that aren't a biller", () => {
    expect(dkimPassFor(gmail("dkim=pass header.i=@maribank.com.ph"), "alerts@maribank.com.ph")).toBe(false);
  });
});

describe("billEmailIntake", () => {
  const valid = {
    messageId: "<abc@mail.example>",
    from: "customercare@meralco.com.ph",
    subject: "Meralco Bill for October 2026",
    receivedAt: "2026-10-28T05:02:42.000Z",
    text: "Current Amount Due: PHP 1,234.56",
    authResults: gmail("dkim=pass header.i=@meralco.com.ph"),
  };

  it("accepts what the script sends", () => {
    expect(billEmailIntake.safeParse(valid).success).toBe(true);
  });

  it("refuses missing fields, a bad date or an oversized body", () => {
    expect(billEmailIntake.safeParse({ ...valid, messageId: " " }).success).toBe(false);
    expect(billEmailIntake.safeParse({ ...valid, receivedAt: "yesterday" }).success).toBe(false);
    expect(billEmailIntake.safeParse({ ...valid, text: "x".repeat(200_001) }).success).toBe(false);
    expect(billEmailIntake.safeParse({ ...valid, authResults: undefined }).success).toBe(false);
    expect(billEmailIntake.safeParse(null).success).toBe(false);
  });
});
