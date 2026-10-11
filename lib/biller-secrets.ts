// The app's only reader of BILLER_SECRET_KEY (docs/features/billers.md). Server-only: importing
// this from a Client Component fails the build. The same key must be in .env.local and Vercel —
// both use the one database — and a copy kept safe: without it the saved passwords are lost.

import "server-only";
import { open, parseKey, seal } from "./secret-box";

function key(): Buffer {
  const value = process.env.BILLER_SECRET_KEY;
  if (!value) throw new Error("Passwords aren't set up: BILLER_SECRET_KEY is not set (docs/setup.md).");
  try {
    return parseKey(value);
  } catch {
    throw new Error("Passwords aren't set up: BILLER_SECRET_KEY isn't a 32-byte base64 key (docs/setup.md).");
  }
}

export function encryptSecret(plain: string): string {
  return seal(plain, key());
}

export function decryptSecret(sealed: string): string {
  return open(sealed, key());
}
