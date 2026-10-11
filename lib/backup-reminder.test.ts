import { describe, expect, it } from "vitest";
import { backupReminder, backupReminderText, type MonthTimes } from "./backup-reminder";

const at = (iso: string) => new Date(iso);
const AUGUST: MonthTimes = { year: 2026, month: 8, createdAt: at("2026-08-01T01:00:00Z"), closedAt: at("2026-09-02T10:00:00Z") };
const SEPTEMBER: MonthTimes = { year: 2026, month: 9, createdAt: at("2026-09-01T02:00:00Z"), closedAt: null };

describe("backupReminder", () => {
  it("reminds after starting a month the last backup doesn't cover", () => {
    const october: MonthTimes = { year: 2026, month: 10, createdAt: at("2026-10-01T03:00:00Z"), closedAt: null };
    expect(backupReminder([AUGUST, SEPTEMBER, october], at("2026-09-20T00:00:00Z"))).toEqual({
      kind: "started",
      year: 2026,
      month: 10,
      never: false,
    });
  });

  it("reminds after closing a month, even an older one", () => {
    // August closed on Sept. 2, after September was started.
    expect(backupReminder([AUGUST, SEPTEMBER], at("2026-09-01T12:00:00Z"))).toMatchObject({ kind: "closed", month: 8 });
  });

  it("says nothing once a backup is newer than every start and close", () => {
    expect(backupReminder([AUGUST, SEPTEMBER], at("2026-09-02T10:00:00Z"))).toBeNull();
    expect(backupReminder([AUGUST, SEPTEMBER], at("2026-10-11T07:00:00Z"))).toBeNull();
  });

  it("reminds when there's never been a backup, and not when there are no months", () => {
    expect(backupReminder([SEPTEMBER], null)).toMatchObject({ kind: "started", month: 9, never: true });
    expect(backupReminder([], null)).toBeNull();
  });

  it("a month reopened and closed again reminds again", () => {
    const reclosed = { ...AUGUST, closedAt: at("2026-10-05T00:00:00Z") };
    expect(backupReminder([reclosed, SEPTEMBER], at("2026-10-01T00:00:00Z"))).toMatchObject({ kind: "closed", month: 8 });
  });
});

describe("backupReminderText", () => {
  it("names the month and what happened", () => {
    expect(backupReminderText({ kind: "started", year: 2026, month: 11, never: false })).toBe(
      "You started November 2026. Download a backup so everything up to now is safe.",
    );
    expect(backupReminderText({ kind: "closed", year: 2026, month: 10, never: false })).toBe(
      "October 2026 is closed. Download a backup so its final numbers are safe.",
    );
    expect(backupReminderText({ kind: "started", year: 2026, month: 10, never: true })).toMatch(/^No backup has been downloaded yet/);
  });
});
