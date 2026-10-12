import { describe, expect, it } from "vitest";
import {
  canCancelPayment,
  canLogIn,
  canManageAdvance,
  canManageHelperEntry,
  canOpenReceipt,
  canSeeBillerField,
  canSeePaymentProof,
  canSubmitPayment,
  isAdmin,
  isViewOnly,
  previewViewer,
  safeNext,
  type Viewer,
} from "./permissions";
import { HOUSE_BUDGET } from "./settlement";

const pa: Viewer = { memberId: 5, name: "PA", role: "admin", email: null };
const housemate: Viewer = { memberId: 3, name: "Housemate", role: "member", email: null };
const onlyLooks: Viewer = { memberId: 7, name: "Family", role: "view_only", email: null };

describe("isAdmin", () => {
  it("is true only for the admin role", () => {
    expect(isAdmin(pa)).toBe(true);
    expect(isAdmin(housemate)).toBe(false);
    expect(isAdmin(onlyLooks)).toBe(false);
  });
});

describe("canLogIn", () => {
  it("lets everyone log in an open month that hasn't ended", () => {
    expect(canLogIn(pa, { status: "open", ended: false })).toBe(true);
    expect(canLogIn(housemate, { status: "open", ended: false })).toBe(true);
  });

  it("locks an ended month for housemates, but not for the admin", () => {
    expect(canLogIn(housemate, { status: "open", ended: true })).toBe(false);
    expect(canLogIn(pa, { status: "open", ended: true })).toBe(true);
  });

  it("locks a closed month for everyone", () => {
    expect(canLogIn(pa, { status: "closed", ended: true })).toBe(false);
    expect(canLogIn(housemate, { status: "closed", ended: false })).toBe(false);
  });
});

describe("isViewOnly", () => {
  it("is true only for the view-only role", () => {
    expect(isViewOnly(onlyLooks)).toBe(true);
    expect(isViewOnly(housemate)).toBe(false);
    expect(isViewOnly(pa)).toBe(false);
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

  it("shows a view-only login the same lines as a housemate", () => {
    expect(canSeeBillerField(onlyLooks, { housematesCanSee: true })).toBe(true);
    expect(canSeeBillerField(onlyLooks, { housematesCanSee: false })).toBe(false);
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

  it("not a view-only login, who owes nothing", () => {
    expect(canSubmitPayment(onlyLooks, pa.memberId)).toBe(false);
  });
});

describe("a view-only login changes nothing, even what's down as theirs", () => {
  const me = onlyLooks.memberId;

  it("no advance, Helper entry or payment", () => {
    expect(canManageAdvance(onlyLooks, { payerId: me, inDefaultColumn: true })).toBe(false);
    expect(canManageHelperEntry(onlyLooks, { kind: "visit", payerId: me })).toBe(false);
    expect(canCancelPayment(onlyLooks, { fromMemberId: me, status: "pending" })).toBe(false);
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

  it("with the House Budget on one side: the admin and the housemate in it", () => {
    expect(canSeePaymentProof(pa, { fromMemberId: 4, toMemberId: HOUSE_BUDGET })).toBe(true);
    expect(canSeePaymentProof(housemate, { fromMemberId: housemate.memberId, toMemberId: HOUSE_BUDGET })).toBe(true);
    expect(canSeePaymentProof(housemate, { fromMemberId: HOUSE_BUDGET, toMemberId: housemate.memberId })).toBe(true);
    expect(canSeePaymentProof(housemate, { fromMemberId: 4, toMemberId: HOUSE_BUDGET })).toBe(false);
  });
});

describe("canOpenReceipt", () => {
  it("opens a bill's proof for everyone", () => {
    expect(canOpenReceipt(housemate, { payment: null })).toBe(true);
  });

  // A House Budget side is NULL in the database, so "both sides set" can't be what marks a
  // payment's receipt: someone else's House Budget payment must stay hidden.
  it("keeps someone else's House Budget payment proof hidden", () => {
    expect(canOpenReceipt(housemate, { payment: { fromMemberId: 4, toMemberId: HOUSE_BUDGET } })).toBe(false);
    expect(canOpenReceipt(housemate, { payment: { fromMemberId: HOUSE_BUDGET, toMemberId: 4 } })).toBe(false);
  });

  it("opens a payment's proof for the admin and the people in it", () => {
    expect(canOpenReceipt(pa, { payment: { fromMemberId: 4, toMemberId: HOUSE_BUDGET } })).toBe(true);
    expect(canOpenReceipt(housemate, { payment: { fromMemberId: housemate.memberId, toMemberId: HOUSE_BUDGET } })).toBe(
      true,
    );
  });
});

describe("previewViewer", () => {
  const target = { memberId: 3, name: "Housemate", role: "member" as const, email: "h@example.com", active: true };

  it("lets the admin preview as an active member, shaped like their own login", () => {
    expect(previewViewer(pa, target)).toEqual({ memberId: 3, name: "Housemate", role: "member", email: "h@example.com" });
  });

  it("previews a view-only login as view-only, so it shows what they really see", () => {
    expect(previewViewer(pa, { ...target, memberId: 7, role: "view_only" })).toEqual({
      memberId: 7,
      name: "Housemate",
      role: "view_only",
      email: "h@example.com",
    });
  });

  it("ignores a preview for a view-only login", () => {
    expect(previewViewer(onlyLooks, target)).toBeNull();
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
