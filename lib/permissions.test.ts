import { describe, expect, it } from "vitest";
import {
  canCancelPayment,
  canManageAdvance,
  canManageHelperEntry,
  canSeeBillerField,
  canSeePaymentProof,
  canSubmitPayment,
  isAdmin,
  previewViewer,
  safeNext,
  type Viewer,
} from "./permissions";

const pa: Viewer = { memberId: 5, name: "PA", role: "admin", email: null };
const housemate: Viewer = { memberId: 3, name: "Housemate", role: "member", email: null };

describe("isAdmin", () => {
  it("is true only for the admin role", () => {
    expect(isAdmin(pa)).toBe(true);
    expect(isAdmin(housemate)).toBe(false);
  });
});

describe("canSeeBillerField", () => {
  it("shows the admin every line, shared or not", () => {
    expect(canSeeBillerField(pa, { housematesCanSee: true })).toBe(true);
    expect(canSeeBillerField(pa, { housematesCanSee: false })).toBe(true);
  });

  it("shows a housemate only the lines shared with them", () => {
    expect(canSeeBillerField(housemate, { housematesCanSee: true })).toBe(true);
    expect(canSeeBillerField(housemate, { housematesCanSee: false })).toBe(false);
  });
});

describe("canManageHelperEntry", () => {
  it("lets the admin change any entry, the carried-over debt included", () => {
    expect(canManageHelperEntry(pa, { kind: "visit", payerId: 3 })).toBe(true);
    expect(canManageHelperEntry(pa, { kind: "opening", payerId: null })).toBe(true);
  });

  it("lets a member change only a visit or early pay they paid", () => {
    expect(canManageHelperEntry(housemate, { kind: "visit", payerId: 3 })).toBe(true);
    expect(canManageHelperEntry(housemate, { kind: "early_pay", payerId: 3 })).toBe(true);
    expect(canManageHelperEntry(housemate, { kind: "visit", payerId: 5 })).toBe(false);
    expect(canManageHelperEntry(housemate, { kind: "opening", payerId: null })).toBe(false);
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

describe("canSubmitPayment", () => {
  it("lets a housemate send an I paid to the collector", () => {
    expect(canSubmitPayment(housemate, pa.memberId)).toBe(true);
  });

  it("not the collector himself, and not when there's no collector", () => {
    expect(canSubmitPayment(pa, pa.memberId)).toBe(false);
    expect(canSubmitPayment(housemate, null)).toBe(false);
  });
});

describe("canCancelPayment", () => {
  const own = (status: "confirmed" | "pending" | "rejected") => ({ fromMemberId: housemate.memberId, status });

  it("lets a housemate cancel their own waiting or rejected payment", () => {
    expect(canCancelPayment(housemate, own("pending"))).toBe(true);
    expect(canCancelPayment(housemate, own("rejected"))).toBe(true);
  });

  it("not once it's confirmed, and never someone else's", () => {
    expect(canCancelPayment(housemate, own("confirmed"))).toBe(false);
    expect(canCancelPayment(housemate, { fromMemberId: 4, status: "pending" })).toBe(false);
  });

  it("lets the admin delete any payment", () => {
    expect(canCancelPayment(pa, own("confirmed"))).toBe(true);
    expect(canCancelPayment(pa, { fromMemberId: 4, status: "pending" })).toBe(true);
  });
});

describe("canSeePaymentProof", () => {
  it("shows a payment's proof to the admin and the two people in it", () => {
    expect(canSeePaymentProof(pa, { fromMemberId: 4, toMemberId: 1 })).toBe(true);
    expect(canSeePaymentProof(housemate, { fromMemberId: housemate.memberId, toMemberId: pa.memberId })).toBe(true);
    expect(canSeePaymentProof(housemate, { fromMemberId: pa.memberId, toMemberId: housemate.memberId })).toBe(true);
  });

  it("not to another housemate", () => {
    expect(canSeePaymentProof(housemate, { fromMemberId: 4, toMemberId: pa.memberId })).toBe(false);
  });
});

describe("previewViewer", () => {
  const target = { memberId: 3, name: "Housemate", role: "member" as const, email: "h@example.com", active: true };

  it("lets the admin preview as an active member, shaped like their own login", () => {
    expect(previewViewer(pa, target)).toEqual({ memberId: 3, name: "Housemate", role: "member", email: "h@example.com" });
  });

  it("ignores a preview for a member", () => {
    expect(previewViewer(housemate, { ...target, memberId: 4 })).toBeNull();
  });

  it("ignores a missing, removed or admin target, or the admin themselves", () => {
    expect(previewViewer(pa, null)).toBeNull();
    expect(previewViewer(pa, { ...target, active: false })).toBeNull();
    expect(previewViewer(pa, { ...target, role: "admin" })).toBeNull();
    expect(previewViewer(pa, { ...target, memberId: 5 })).toBeNull();
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
