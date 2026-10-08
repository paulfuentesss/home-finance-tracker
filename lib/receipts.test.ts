import { describe, expect, it } from "vitest";
import {
  checkReceiptFile,
  cleanFileName,
  fitReceiptSize,
  MAX_RECEIPT_BYTES,
  MAX_RECEIPTS_PER_ITEM,
  receiptObjectPath,
  receiptsLeft,
  sniffReceiptType,
} from "./receipts";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 ");
const PDF = bytes("%PDF-1.7\n");

describe("sniffReceiptType", () => {
  it("recognizes JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffReceiptType(JPEG)).toBe("image/jpeg");
    expect(sniffReceiptType(PNG)).toBe("image/png");
    expect(sniffReceiptType(WEBP)).toBe("image/webp");
  });

  it("refuses anything else, whatever the file is called", () => {
    expect(sniffReceiptType(PDF)).toBeNull(); // proof is a screenshot, not a document
    expect(sniffReceiptType(bytes("<svg xmlns="))).toBeNull(); // SVG can carry scripts
    expect(sniffReceiptType(bytes("<html>"))).toBeNull();
    expect(sniffReceiptType(bytes("GIF89a"))).toBeNull();
    expect(sniffReceiptType(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBeNull(); // RIFF but not WebP
    expect(sniffReceiptType(bytes([0xff, 0xd8]))).toBeNull(); // too short to be a JPEG
    expect(sniffReceiptType(new Uint8Array())).toBeNull();
  });
});

describe("checkReceiptFile", () => {
  it("accepts a known type within the size limit", () => {
    expect(checkReceiptFile(WEBP)).toEqual({ ok: true, contentType: "image/webp" });
  });

  it("refuses empty, too large and unknown files", () => {
    expect(checkReceiptFile(new Uint8Array())).toMatchObject({ ok: false, error: "That file is empty." });
    const big = new Uint8Array(MAX_RECEIPT_BYTES + 1);
    big.set(JPEG);
    expect(checkReceiptFile(big)).toMatchObject({ ok: false, error: expect.stringContaining("too large") });
    expect(checkReceiptFile(bytes("hello"))).toMatchObject({ ok: false, error: expect.stringContaining("screenshot") });
    expect(checkReceiptFile(PDF)).toMatchObject({ ok: false });
  });

  it("accepts a file exactly at the limit", () => {
    const max = new Uint8Array(MAX_RECEIPT_BYTES);
    max.set(PNG);
    expect(checkReceiptFile(max)).toEqual({ ok: true, contentType: "image/png" });
  });
});

describe("receiptObjectPath", () => {
  const uuid = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

  it("files receipts under year and zero-padded month, named by a random id", () => {
    expect(receiptObjectPath(2026, 8, uuid, "image/jpeg")).toBe(`2026/08/${uuid}.jpg`);
    expect(receiptObjectPath(2026, 12, uuid, "image/png")).toBe(`2026/12/${uuid}.png`);
  });

  it("only takes a UUID as the name, so nothing else can end up in the path", () => {
    expect(() => receiptObjectPath(2026, 8, "../../etc/passwd", "image/png")).toThrow();
  });
});

describe("fitReceiptSize", () => {
  it("keeps images that are already narrow enough", () => {
    expect(fitReceiptSize(1170, 2532)).toEqual({ width: 1170, height: 2532 });
    expect(fitReceiptSize(200, 100)).toEqual({ width: 200, height: 100 });
  });

  it("caps the width and keeps the proportions", () => {
    expect(fitReceiptSize(2880, 1800)).toEqual({ width: 1440, height: 900 });
  });

  it("keeps a long scrolling screenshot readable: full width while it fits a phone's canvas", () => {
    expect(fitReceiptSize(1170, 8000)).toEqual({ width: 1170, height: 8000 });
  });

  it("scales down only as far as a phone can draw", () => {
    const { width, height } = fitReceiptSize(1170, 20000);
    expect(width * height).toBeLessThanOrEqual(16_000_000);
    expect(width).toBeGreaterThan(900);
    expect(width / height).toBeCloseTo(1170 / 20000, 3);
    expect(Math.max(...Object.values(fitReceiptSize(400, 40000)))).toBeLessThanOrEqual(16_384);
  });
});

describe("receiptsLeft", () => {
  it("counts down to the per-item limit and never below zero", () => {
    expect(receiptsLeft(0)).toBe(MAX_RECEIPTS_PER_ITEM);
    expect(receiptsLeft(MAX_RECEIPTS_PER_ITEM - 1)).toBe(1);
    expect(receiptsLeft(MAX_RECEIPTS_PER_ITEM)).toBe(0);
    expect(receiptsLeft(MAX_RECEIPTS_PER_ITEM + 2)).toBe(0);
  });
});

describe("cleanFileName", () => {
  it("trims, drops control characters and caps the length", () => {
    expect(cleanFileName("  Meralco Aug.png ")).toBe("Meralco Aug.png");
    expect(cleanFileName("a\u0000b\nc.jpg")).toBe("abc.jpg");
    expect(cleanFileName("x".repeat(200))).toHaveLength(120);
  });

  it("gives null for missing or blank names", () => {
    expect(cleanFileName(undefined)).toBeNull();
    expect(cleanFileName("   ")).toBeNull();
  });
});
