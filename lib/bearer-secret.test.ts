import { describe, expect, it } from "vitest";
import { checkBearerSecret } from "@/lib/bearer-secret";

describe("checkBearerSecret", () => {
  const secret = "s3cret-value-from-openssl";

  it("accepts the right Bearer secret", () => {
    expect(checkBearerSecret(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("refuses a wrong, missing, malformed or differently sized secret", () => {
    expect(checkBearerSecret("Bearer nope", secret)).toBe(false);
    expect(checkBearerSecret(`Bearer ${secret}x`, secret)).toBe(false);
    expect(checkBearerSecret(secret, secret)).toBe(false);
    expect(checkBearerSecret("Bearer ", secret)).toBe(false);
    expect(checkBearerSecret(null, secret)).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    expect(checkBearerSecret("Bearer ", "")).toBe(false);
    expect(checkBearerSecret("Bearer anything", "")).toBe(false);
    expect(checkBearerSecret("Bearer undefined", "")).toBe(false);
  });
});
