import { describe, expect, it } from "vitest";
import { billEmailIntake, resultsOf, sentByBiller } from "@/lib/bill-email/intake";

// The shape of Gmail's header (made-up selectors and signatures). DMARC fails by default, so
// these cases test DKIM on its own.
const gmail = (dkim: string, dmarc = "dmarc=fail (p=NONE sp=NONE dis=NONE) header.from=meralco.com.ph") =>
  `mx.google.com;\r\n       ${dkim};\r\n       spf=pass (google.com: domain of x@y designates 1.2.3.4 as permitted sender) smtp.mailfrom=bounce@mailer.example;\r\n       ${dmarc}`;

// Real shapes from Meralco's October 2026 bill (made-up addresses, selectors and signatures).
// Meralco signs through Salesforce and sends from its own bounce domain, so DMARC passes on SPF.
const direct = (dmarc = "dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=meralco.com.ph") =>
  `mx.google.com;\r\n       dkim=pass header.i=@s7.y.mc.salesforce.com header.s=sel1 header.b=AbCd1234;\r\n       spf=pass (google.com: domain of bounce-abc.123@bounce.email.meralco.com.ph designates 192.0.2.91 as permitted sender) smtp.mailfrom=bounce-ABC.123@bounce.email.meralco.com.ph;\r\n       ${dmarc}`;

// The same bill forwarded by a Gmail filter: SPF is now the forwarder's, DMARC fails, and only
// Gmail's ARC summary carries the first arrival's verdict.
const ARC_SUMMARY =
  "i=2 spf=pass spfdomain=bounce.email.meralco.com.ph dkim=pass dkdomain=s7.y.mc.salesforce.com dmarc=pass fromdomain=meralco.com.ph";
const forwarded = (arc: string | null = `arc=pass (${ARC_SUMMARY})`) =>
  [
    "mx.google.com",
    "\r\n       dkim=pass header.i=@s7.y.mc.salesforce.com header.s=sel1 header.b=AbCd1234",
    ...(arc === null ? [] : [`\r\n       ${arc}`]),
    '\r\n       spf=pass (google.com: domain of someone+caf_=house=gmail.com@gmail.com designates 192.0.2.41 as permitted sender) smtp.mailfrom="someone+caf_=house=gmail.com@gmail.com"',
    "\r\n       dmarc=fail (p=NONE sp=NONE dis=NONE arc=pass) header.from=meralco.com.ph",
    "\r\n       dara=pass header.i=@gmail.com",
  ].join(";");
const seal = (i: number, d = "google.com") =>
  `i=${i}; a=rsa-sha256; t=1700000000; cv=${i === 1 ? "none" : "pass"}; d=${d}; s=arc-sel; b=AbC/dEf+GhI= JkL==`;
const SEALS = [seal(3), seal(2), seal(1)];
const MERALCO = '"MANILA ELECTRIC COMPANY" <customercare@meralco.com.ph>';

// The shared secret is checked by checkBearerSecret (lib/bearer-secret.test.ts).

describe("sentByBiller — DKIM", () => {
  it("accepts a DKIM pass signed by the biller's domain, for each biller", () => {
    expect(sentByBiller(gmail("dkim=pass header.i=@meralco.com.ph header.s=s1 header.b=abc"), "customercare@meralco.com.ph")).toBe(true);
    expect(sentByBiller(gmail("dkim=pass header.i=@manilawater.com header.s=s1 header.b=abc"), "ETAXFORMS@MANILAWATER.COM")).toBe(true);
    expect(sentByBiller(gmail("dkim=pass header.d=pldt.com.ph header.s=s1"), "PLDT <pldthome@pldt.com.ph>")).toBe(true);
  });

  it("accepts a signer that is a subdomain of the biller, and the header name in front", () => {
    expect(sentByBiller(`Authentication-Results: ${gmail("dkim=pass header.i=@email.meralco.com.ph")}`, "customercare@meralco.com.ph")).toBe(true);
  });

  it("refuses a failed signature, or none", () => {
    expect(sentByBiller(gmail("dkim=fail header.i=@meralco.com.ph"), "customercare@meralco.com.ph")).toBe(false);
    expect(sentByBiller(gmail("dkim=none"), "customercare@meralco.com.ph")).toBe(false);
    expect(sentByBiller("", "customercare@meralco.com.ph")).toBe(false);
  });

  it("refuses a pass for some other domain, even next to the biller's fail", () => {
    expect(sentByBiller(gmail("dkim=pass header.i=@mailer.example"), "customercare@meralco.com.ph")).toBe(false);
    expect(
      sentByBiller(gmail("dkim=pass header.i=@mailer.example; dkim=fail header.i=@meralco.com.ph"), "customercare@meralco.com.ph"),
    ).toBe(false);
  });

  it("refuses lookalike signers and senders", () => {
    expect(sentByBiller(gmail("dkim=pass header.i=@meralco.com.ph.evil.test"), "customercare@meralco.com.ph")).toBe(false);
    expect(sentByBiller(gmail("dkim=pass header.i=@notmeralco.com.ph"), "customercare@meralco.com.ph")).toBe(false);
    expect(sentByBiller(gmail("dkim=pass header.i=@meralco.com.ph.evil.test"), "x@meralco.com.ph.evil.test")).toBe(false);
  });

  it("refuses a pass for one biller on an email claiming to be from another", () => {
    expect(sentByBiller(gmail("dkim=pass header.i=@pldt.com.ph"), "customercare@meralco.com.ph")).toBe(false);
  });

  it("refuses a header that Gmail didn't write", () => {
    expect(sentByBiller(gmail("dkim=pass header.i=@meralco.com.ph").replace("mx.google.com", "mx.evil.test"), "customercare@meralco.com.ph")).toBe(false);
  });

  it("refuses senders that aren't a biller", () => {
    expect(sentByBiller(gmail("dkim=pass header.i=@maribank.com.ph"), "alerts@maribank.com.ph")).toBe(false);
  });
});

describe("sentByBiller — DMARC", () => {
  it("accepts Meralco's bill as it arrives: Salesforce's signature, DMARC passing for meralco.com.ph", () => {
    expect(sentByBiller(direct(), MERALCO)).toBe(true);
  });

  it("refuses it when DMARC fails", () => {
    expect(sentByBiller(direct("dmarc=fail (p=NONE sp=NONE dis=NONE) header.from=meralco.com.ph"), MERALCO)).toBe(false);
  });

  it("refuses a DMARC pass for another biller, a lookalike, or more than one domain", () => {
    expect(sentByBiller(direct("dmarc=pass header.from=pldt.com.ph"), MERALCO)).toBe(false);
    expect(sentByBiller(direct("dmarc=pass header.from=meralco.com.ph.evil.test"), MERALCO)).toBe(false);
    expect(sentByBiller(direct("dmarc=pass header.from=meralco.com.ph header.from=evil.test"), MERALCO)).toBe(false);
  });

  it("refuses a DMARC pass in a header that Gmail didn't write", () => {
    expect(sentByBiller(direct().replace("mx.google.com", "mx.evil.test"), MERALCO)).toBe(false);
  });
});

describe("sentByBiller — forwarded, ARC sealed by Google", () => {
  it("accepts the forwarded bill when Google sealed the verdict Gmail summarises", () => {
    expect(sentByBiller(forwarded(), MERALCO, SEALS)).toBe(true);
    expect(sentByBiller(forwarded(), MERALCO, [seal(2)])).toBe(true);
  });

  it("refuses it without that Google seal", () => {
    expect(sentByBiller(forwarded(), MERALCO)).toBe(false);
    expect(sentByBiller(forwarded(), MERALCO, [seal(3), seal(2, "evil.test"), seal(1)])).toBe(false);
    expect(sentByBiller(forwarded(), MERALCO, [seal(2, "google.com.evil.test")])).toBe(false);
    expect(sentByBiller(forwarded(), MERALCO, [seal(1)])).toBe(false);
    expect(sentByBiller(forwarded(), MERALCO, [seal(2), seal(2)])).toBe(false);
  });

  it("refuses a seal that repeats a tag, whichever value comes last", () => {
    expect(sentByBiller(forwarded(), MERALCO, ["i=2; d=evil.test; s=x; d=google.com"])).toBe(false);
    expect(sentByBiller(forwarded(), MERALCO, [seal(3), "i=9; i=2; d=google.com", seal(2)])).toBe(false);
  });

  it("refuses it when ARC fails, or the summary isn't a DMARC pass for the biller", () => {
    expect(sentByBiller(forwarded(`arc=fail (${ARC_SUMMARY})`), MERALCO, SEALS)).toBe(false);
    const summary = (change: string) => `arc=pass (${ARC_SUMMARY.replace("dmarc=pass fromdomain=meralco.com.ph", change)})`;
    expect(sentByBiller(forwarded(summary("dmarc=fail fromdomain=meralco.com.ph")), MERALCO, SEALS)).toBe(false);
    expect(sentByBiller(forwarded(summary("dmarc=pass fromdomain=meralco.com.ph.evil.test")), MERALCO, SEALS)).toBe(false);
    expect(sentByBiller(forwarded(summary("dmarc=pass fromdomain=pldt.com.ph")), MERALCO, SEALS)).toBe(false);
    expect(sentByBiller(forwarded(summary("dmarc=fail dmarc=pass fromdomain=meralco.com.ph")), MERALCO, SEALS)).toBe(false);
    expect(sentByBiller(forwarded("arc=pass"), MERALCO, SEALS)).toBe(false);
  });

  it("refuses a summary with anything but key=value words, or an odd instance number", () => {
    expect(sentByBiller(forwarded(`arc=pass (${ARC_SUMMARY} junk)`), MERALCO, SEALS)).toBe(false);
    expect(sentByBiller(forwarded(`arc=pass (${ARC_SUMMARY.replace("i=2", "i=0")})`), MERALCO, [...SEALS, seal(0)])).toBe(false);
    expect(sentByBiller(forwarded(`arc=pass (${ARC_SUMMARY.replace("i=2 ", "")})`), MERALCO, SEALS)).toBe(false);
  });

  it("refuses the 'arc=pass' inside the DMARC result's comment as an ARC result", () => {
    expect(sentByBiller(forwarded(null), MERALCO, SEALS)).toBe(false);
  });

  it("refuses an ARC pass in a header that Gmail didn't write", () => {
    expect(sentByBiller(forwarded().replace("mx.google.com", "mx.evil.test"), MERALCO, SEALS)).toBe(false);
  });
});

describe("sentByBiller — a sender's own address can't plant a result", () => {
  // The SPF part repeats MAIL FROM, which the sender picks; a quoted one can hold ; ( ) and quotes.
  it("refuses a quoted address that closes Gmail's comment early", () => {
    const planted = '"a)b; dkim=pass header.d=meralco.com.ph "@evil.test';
    const header = `mx.google.com;\r\n       dkim=pass header.i=@evil.test;\r\n       spf=pass (google.com: domain of ${planted} designates 192.0.2.7 as permitted sender) smtp.mailfrom=${planted};\r\n       dmarc=fail header.from=meralco.com.ph`;
    expect(sentByBiller(header, MERALCO)).toBe(false);
  });

  it("refuses a quoted address with an escaped quote", () => {
    const header = `mx.google.com; dkim=pass header.i=@evil.test; spf=pass smtp.mailfrom="a\\"; dkim=pass header.d=meralco.com.ph \\""@evil.test; dmarc=fail header.from=meralco.com.ph`;
    expect(sentByBiller(header, MERALCO)).toBe(false);
  });
});

describe("resultsOf", () => {
  it("splits Gmail's header into results, setting comments aside and dropping quoted strings", () => {
    const results = resultsOf(forwarded());
    expect(results?.map((r) => r.text)).toEqual([
      "mx.google.com",
      "dkim=pass header.i=@s7.y.mc.salesforce.com header.s=sel1 header.b=AbCd1234",
      "arc=pass",
      "spf=pass smtp.mailfrom=",
      "dmarc=fail header.from=meralco.com.ph",
      "dara=pass header.i=@gmail.com",
    ]);
    expect(results?.[2].comments).toEqual([ARC_SUMMARY]);
    expect(results?.[4].comments).toEqual(["p=NONE sp=NONE dis=NONE arc=pass"]);
  });

  it("can't read a header with a stray ), or a comment or quote left open", () => {
    expect(resultsOf("mx.google.com; dkim=pass) header.d=meralco.com.ph")).toBeNull();
    expect(resultsOf("mx.google.com; dmarc=pass (p=NONE header.from=meralco.com.ph")).toBeNull();
    expect(resultsOf('mx.google.com; spf=pass smtp.mailfrom="x@meralco.com.ph')).toBeNull();
    expect(resultsOf("mx.google.com; spf=pass (nested (comment)) smtp.mailfrom=x@y")).toBeNull();
  });

  it("can't read a header where a comment or quoted string holds what could end it early", () => {
    expect(resultsOf('mx.google.com; spf=pass (domain of "x" here) smtp.mailfrom=x@y')).toBeNull();
    expect(resultsOf("mx.google.com; spf=pass (domain of x; here) smtp.mailfrom=x@y")).toBeNull();
    expect(resultsOf("mx.google.com; spf=pass (domain of x\\ here) smtp.mailfrom=x@y")).toBeNull();
    expect(resultsOf('mx.google.com; spf=pass smtp.mailfrom="a)b"@x')).toBeNull();
    expect(resultsOf('mx.google.com; spf=pass smtp.mailfrom="a(b"@x')).toBeNull();
    expect(resultsOf('mx.google.com; spf=pass smtp.mailfrom="a;b"@x')).toBeNull();
    expect(resultsOf('mx.google.com; spf=pass smtp.mailfrom="a\\b"@x')).toBeNull();
    expect(resultsOf("mx.google.com; spf=pass smtp.mailfrom=a\\b@x")).toBeNull();
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

  it("accepts what the script sends, with or without the ARC seals", () => {
    expect(billEmailIntake.safeParse({ ...valid, arcSeals: SEALS }).data?.arcSeals).toEqual(SEALS);
    // Script copies from before the ARC seals were sent.
    expect(billEmailIntake.safeParse(valid).data?.arcSeals).toEqual([]);
  });

  it("refuses missing fields, a bad date or an oversized body", () => {
    expect(billEmailIntake.safeParse({ ...valid, messageId: " " }).success).toBe(false);
    expect(billEmailIntake.safeParse({ ...valid, receivedAt: "yesterday" }).success).toBe(false);
    expect(billEmailIntake.safeParse({ ...valid, text: "x".repeat(200_001) }).success).toBe(false);
    expect(billEmailIntake.safeParse({ ...valid, authResults: undefined }).success).toBe(false);
    expect(billEmailIntake.safeParse(null).success).toBe(false);
  });

  it("refuses too many ARC seals, or an oversized one", () => {
    expect(billEmailIntake.safeParse({ ...valid, arcSeals: Array(21).fill(seal(1)) }).success).toBe(false);
    expect(billEmailIntake.safeParse({ ...valid, arcSeals: ["x".repeat(20_001)] }).success).toBe(false);
  });
});
