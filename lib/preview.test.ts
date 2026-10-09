import { describe, expect, it } from "vitest";
import { parsePreviewCookie } from "./preview";

describe("parsePreviewCookie", () => {
  it("reads a member id", () => {
    expect(parsePreviewCookie("3")).toBe(3);
    expect(parsePreviewCookie("2147483647")).toBe(2147483647);
  });

  it.each([undefined, "", "0", "-1", "03", "1.5", "3abc", " 3", "1e3", "2147483648", "99999999999"])(
    "ignores %j",
    (value) => {
      expect(parsePreviewCookie(value)).toBeNull();
    },
  );
});
