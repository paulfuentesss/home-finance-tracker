import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { open, parseKey, seal } from "./secret-box";

const key = randomBytes(32);

describe("seal / open", () => {
  it("opens what it sealed", () => {
    expect(open(seal("hunter2 ✓ ñ", key), key)).toBe("hunter2 ✓ ñ");
    expect(open(seal("", key), key)).toBe("");
  });

  it("never stores the secret as-is, and locks it differently every time", () => {
    const a = seal("same password", key);
    const b = seal("same password", key);
    expect(a).not.toContain("same password");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
  });

  it("refuses a wrong key", () => {
    expect(() => open(seal("secret", key), randomBytes(32))).toThrow(/Couldn't unlock/);
  });

  it("refuses a changed value", () => {
    const [v, iv, tag, ct] = seal("secret", key).split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 1;
    expect(() => open([v, iv, tag, flipped.toString("base64url")].join("."), key)).toThrow(/Couldn't unlock/);
  });

  it("refuses something that isn't a sealed value", () => {
    expect(() => open("plain text", key)).toThrow(/Not a sealed value/);
    expect(() => open("v2.a.b.c", key)).toThrow(/Not a sealed value/);
  });

  it("doesn't say what's inside when it fails", () => {
    let message = "";
    try {
      open(seal("hunter2", key), randomBytes(32));
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/Couldn't unlock/);
    expect(message).not.toContain("hunter2");
  });
});

describe("parseKey", () => {
  it("takes a 32-byte base64 key", () => {
    expect(parseKey(key.toString("base64"))).toEqual(key);
  });

  it("refuses any other length", () => {
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => parseKey("")).toThrow(/32 bytes/);
  });
});
