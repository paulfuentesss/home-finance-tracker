import { describe, expect, it } from "vitest";
import { dotClassOf, householdDotClassOf, sharesCosts, VIEW_ONLY_DOT_CLASS } from "./members";

describe("sharesCosts", () => {
  it("is true for the admin and housemates, false for a view-only login", () => {
    expect(sharesCosts({ role: "admin" })).toBe(true);
    expect(sharesCosts({ role: "member" })).toBe(true);
    expect(sharesCosts({ role: "view_only" })).toBe(false);
  });
});

describe("dotClassOf", () => {
  it("colours members by sort order, repeating after five", () => {
    expect(dotClassOf({ sortOrder: 1 })).toBe("bg-rose-500");
    expect(dotClassOf({ sortOrder: 6 })).toBe("bg-rose-500");
    expect(dotClassOf({ sortOrder: 2 })).toBe("bg-violet-500");
  });
});

describe("householdDotClassOf", () => {
  it("is a member's own colour for anyone who shares the costs", () => {
    expect(householdDotClassOf({ sortOrder: 2, role: "member" })).toBe("bg-violet-500");
    expect(householdDotClassOf({ sortOrder: 1, role: "admin" })).toBe("bg-rose-500");
  });

  it("is grey for a view-only login, whatever their sort order", () => {
    expect(householdDotClassOf({ sortOrder: 2, role: "view_only" })).toBe(VIEW_ONLY_DOT_CLASS);
  });
});
