// Locks and unlocks a short secret (a biller password) with a 32-byte key: AES-256-GCM, a fresh
// random IV each time, and an auth tag so a changed or swapped value fails instead of opening
// to garbage. Pure — the key is passed in (lib/biller-secrets.ts reads it) — so tests can run it.
// docs/features/billers.md explains the setup; docs/decisions.md (2026-10-12) why.
//
// Stored form: "v1.<iv>.<tag>.<ciphertext>", each part base64url. "v1" names the format, so a
// later key change can tell old values from new ones.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** The key from its base64 form (`openssl rand -base64 32`); throws unless it's exactly 32 bytes. */
export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64.trim(), "base64");
  if (key.length !== KEY_BYTES) throw new Error(`The key must be ${KEY_BYTES} bytes, base64 (openssl rand -base64 32).`);
  return key;
}

export function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Unlocks what `seal` made. Throws on a wrong key or a changed value — never says what's inside. */
export function open(sealed: string, key: Buffer): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Not a sealed value.");
  const [iv, tag, ciphertext] = parts.slice(1).map((p) => Buffer.from(p, "base64url"));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("Not a sealed value.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Couldn't unlock: wrong key, or the value was changed.");
  }
}
