import { describe, expect, it } from "vitest";
import { devicePlatform, deviceVia } from "../db/schema";
import {
  DEVICE_PLATFORMS,
  DEVICE_VIAS,
  deviceLabel,
  parseSeen,
  platformOf,
  seenLabel,
  summarizeDevices,
  type DeviceRow,
} from "./devices";

it("lists the same values as the database's enums", () => {
  expect([...DEVICE_VIAS]).toEqual(deviceVia.enumValues);
  expect([...DEVICE_PLATFORMS]).toEqual(devicePlatform.enumValues);
});

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  ipadOld: "Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  // iPadOS 13+ and a Mac send the same thing; only touch tells them apart.
  macLike:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

describe("platformOf", () => {
  it("tells the household's devices apart", () => {
    expect(platformOf(UA.iphone, 5)).toBe("iphone");
    expect(platformOf(UA.ipadOld, 5)).toBe("ipad");
    expect(platformOf(UA.android, 5)).toBe("android");
    expect(platformOf(UA.windows, 0)).toBe("windows");
    expect(platformOf(UA.linux, 0)).toBe("other");
  });

  it("calls a 'Mac' with a touchscreen an iPad", () => {
    expect(platformOf(UA.macLike, 5)).toBe("ipad");
    expect(platformOf(UA.macLike, 0)).toBe("mac");
  });
});

describe("parseSeen", () => {
  it("accepts only the known values", () => {
    expect(parseSeen({ via: "app", platform: "iphone" })).toEqual({ via: "app", platform: "iphone", drawnAt: null });
    expect(parseSeen({ via: "native", platform: "iphone" })).toBeNull();
    expect(parseSeen({ via: "web", platform: "linux" })).toBeNull();
    expect(parseSeen({ via: "web" })).toBeNull();
    expect(parseSeen(null)).toBeNull();
    expect(parseSeen("app")).toBeNull();
  });

  it("reads when a month page was drawn, and ignores anything that isn't a time", () => {
    const drawn = Date.parse("2026-11-01T02:00:00Z");
    expect(parseSeen({ via: "web", platform: "mac", drawnAt: drawn })?.drawnAt).toEqual(new Date(drawn));
    expect(parseSeen({ via: "web", platform: "mac", drawnAt: "2026-11-01" })?.drawnAt).toBeNull();
    expect(parseSeen({ via: "web", platform: "mac", drawnAt: Number.NaN })?.drawnAt).toBeNull();
    expect(parseSeen({ via: "web", platform: "mac", drawnAt: 1e20 })?.drawnAt).toBeNull();
  });
});

describe("seenLabel", () => {
  // 6:00 PM on Oct. 12 in Manila (UTC+8).
  const now = new Date("2026-10-12T10:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("counts minutes, then hours within the same Manila day", () => {
    expect(seenLabel(ago(30_000), now)).toBe("just now");
    expect(seenLabel(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(seenLabel(ago(59 * 60_000), now)).toBe("59 min ago");
    expect(seenLabel(ago(3 * 3_600_000), now)).toBe("3 h ago");
    // Midnight Oct. 12 in Manila: still today, 18 hours ago.
    expect(seenLabel(new Date("2026-10-11T16:00:00Z"), now)).toBe("18 h ago");
  });

  it("goes by Manila calendar days after that", () => {
    // 11:59 PM Oct. 11 in Manila: only 18 hours ago, but yesterday.
    expect(seenLabel(new Date("2026-10-11T15:59:00Z"), now)).toBe("yesterday");
    expect(seenLabel(new Date("2026-10-09T10:00:00Z"), now)).toBe("3 days ago");
    expect(seenLabel(new Date("2026-10-05T10:00:00Z"), now)).toBe("Oct. 5");
    expect(seenLabel(new Date("2025-12-30T10:00:00Z"), now)).toBe("Dec. 30, 2025");
  });

  it("treats a moment slightly in the future (clock drift) as just now", () => {
    expect(seenLabel(new Date(now.getTime() + 90_000), now)).toBe("just now");
  });
});

describe("summarizeDevices", () => {
  const row = (memberId: number, via: DeviceRow["via"], platform: DeviceRow["platform"], iso: string): DeviceRow => ({
    memberId,
    via,
    platform,
    lastSeenAt: new Date(iso),
  });

  it("gives each member their latest device, whether they've used the app, and every device newest first", () => {
    const ana = [row(1, "web", "mac", "2026-10-10T01:00:00Z"), row(1, "app", "iphone", "2026-10-12T01:00:00Z")];
    const ben = [row(2, "web", "android", "2026-10-11T01:00:00Z")];
    const summary = summarizeDevices([...ana, ...ben]);

    expect(summary.get(1)).toEqual({ lastSeen: ana[1], installed: true, devices: [ana[1], ana[0]] });
    expect(summary.get(2)).toEqual({ lastSeen: ben[0], installed: false, devices: [ben[0]] });
    expect(summary.has(3)).toBe(false);
  });
});

describe("deviceLabel", () => {
  it("reads as app or web, on which device", () => {
    expect(deviceLabel({ via: "app", platform: "iphone" })).toBe("App on iPhone");
    expect(deviceLabel({ via: "web", platform: "other" })).toBe("Web on another device");
  });
});
