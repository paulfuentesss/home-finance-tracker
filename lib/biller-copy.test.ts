import { describe, expect, it } from "vitest";
import { isCopyable } from "./biller-copy";

describe("isCopyable", () => {
  it("copies account and ID numbers, emails and addresses", () => {
    expect(isCopyable("0123456789")).toBe(true);
    expect(isCopyable("ACC-12345")).toBe(true);
    expect(isCopyable("house@example.com")).toBe(true);
    expect(isCopyable("192.168.0.1")).toBe(true);
  });

  it("doesn't copy names, words or sentences", () => {
    expect(isCopyable("JUAN DELA CRUZ")).toBe(false);
    expect(isCopyable("Call 171")).toBe(false);
    expect(isCopyable("Paid through the app using a card")).toBe(false);
    expect(isCopyable("contractor")).toBe(false);
    expect(isCopyable("")).toBe(false);
  });
});
