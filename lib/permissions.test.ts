import { describe, expect, it } from "vitest";
import { canManageAdvance, isAdmin, safeNext, type Viewer } from "./permissions";

const pa: Viewer = { memberId: 5, name: "PA", role: "admin", email: null };
const housemate: Viewer = { memberId: 3, name: "Housemate", role: "member", email: null };

describe("isAdmin", () => {
  it("is true only for the admin role", () => {
    expect(isAdmin(pa)).toBe(true);
    expect(isAdmin(housemate)).toBe(false);
  });
});

describe("canManageAdvance", () => {
  it("lets the admin change any advance, in any column", () => {
    expect(canManageAdvance(pa, { payerId: 3, inDefaultColumn: false })).toBe(true);
    expect(canManageAdvance(pa, { payerId: 5, inDefaultColumn: true })).toBe(true);
  });

  it("lets a member change their own advance in the default column", () => {
    expect(canManageAdvance(housemate, { payerId: 3, inDefaultColumn: true })).toBe(true);
  });

  it("doesn't let a member change someone else's advance", () => {
    expect(canManageAdvance(housemate, { payerId: 5, inDefaultColumn: true })).toBe(false);
  });

  it("doesn't let a member change their own advance once PA moved it to another column", () => {
    expect(canManageAdvance(housemate, { payerId: 3, inDefaultColumn: false })).toBe(false);
  });
});

describe("safeNext", () => {
  const origin = "http://localhost:3000";

  it.each([
    "@evil.com",
    ".evil.com",
    null,
    undefined,
    "",
    "/\\evil.com",
    "//evil.com",
    "/.//evil.com",
    "/..//evil.com",
    "/\t/evil.com",
    "https://evil.com",
    "javascript:alert(1)",
  ])("sends %j home instead of off-site", (next) => {
    const path = safeNext(next, origin);
    expect(path).toBe("/");
    expect(new URL(`${origin}${path}`).host).toBe("localhost:3000");
  });

  it("keeps a path on this site, with its query", () => {
    expect(safeNext("/periods/2026/8?x=1", origin)).toBe("/periods/2026/8?x=1");
    expect(safeNext("/periods/2026/8/advances", origin)).toBe("/periods/2026/8/advances");
  });

  it("returns the normalized path, never the raw input", () => {
    expect(safeNext("/periods/../how-it-works", origin)).toBe("/how-it-works");
  });
});
