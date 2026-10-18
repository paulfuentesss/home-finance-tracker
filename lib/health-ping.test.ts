import { describe, expect, it } from "vitest";
import { healthPingPath } from "./health-ping";

describe("healthPingPath", () => {
  it("pings plain when every email went (or there was nothing to send)", () => {
    expect(healthPingPath({ failed: [] })).toBe("");
  });

  it("pings /fail when an email couldn't be sent", () => {
    expect(healthPingPath({ failed: ["last_day → Ben"] })).toBe("/fail");
  });

  it("pings /fail when the run threw (the database down, a bug)", () => {
    expect(healthPingPath("threw")).toBe("/fail");
  });
});
