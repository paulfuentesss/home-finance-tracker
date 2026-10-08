// Receipt files (docs/features/receipts.md): which files are accepted and where they're stored.
// Pure — no DB or Storage access — and covered by tests. The upload itself is in actions.ts.

/** The private Supabase Storage bucket (`npm run storage:setup` creates it). */
export const RECEIPTS_BUCKET = "receipts";

/** Largest file accepted. Phone screenshots are made much smaller in the browser first. */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

/** Most proofs one bill or payment can have, so a mis-tap can't attach a whole camera roll. */
export const MAX_RECEIPTS_PER_ITEM = 5;

/** How many more proofs a bill or payment that already has `existing` can take. */
export function receiptsLeft(existing: number): number {
  return Math.max(0, MAX_RECEIPTS_PER_ITEM - existing);
}

/** The file types accepted (images only: a screenshot is the proof), with their extension. */
export const RECEIPT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ReceiptContentType = keyof typeof RECEIPT_TYPES;

const startsWith = (bytes: Uint8Array, prefix: number[], offset = 0) =>
  prefix.every((b, i) => bytes[offset + i] === b);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/**
 * The file's real type, read from its first bytes ("magic numbers") — never the type the
 * browser claims, which anyone can fake. Null when it isn't one we accept.
 */
export function sniffReceiptType(bytes: Uint8Array): ReceiptContentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

/** Checks a file before upload: its type and size. Returns the type, or why it's refused. */
export function checkReceiptFile(
  bytes: Uint8Array,
): { ok: true; contentType: ReceiptContentType } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "That file is empty." };
  if (bytes.length > MAX_RECEIPT_BYTES) {
    return { ok: false, error: `That file is too large (the limit is ${MAX_RECEIPT_BYTES / 1024 / 1024} MB).` };
  }
  const contentType = sniffReceiptType(bytes);
  if (!contentType) return { ok: false, error: "Attach a screenshot or photo (JPG, PNG or WebP)." };
  return { ok: true, contentType };
}

/**
 * Where a receipt is stored in the bucket: `YYYY/MM/<random id>.<ext>`. The random id keeps
 * names unguessable and never includes the original file name (which can hold personal details).
 */
export function receiptObjectPath(year: number, month: number, randomId: string, contentType: ReceiptContentType) {
  if (!/^[0-9a-f-]{36}$/.test(randomId)) throw new Error("receiptObjectPath needs a UUID");
  return `${year}/${String(month).padStart(2, "0")}/${randomId}.${RECEIPT_TYPES[contentType]}`;
}

/** Screenshots are resized in the browser to at most this width (tall ones keep their height). */
export const RECEIPT_MAX_WIDTH = 1440;
// Phones refuse to draw canvases larger than this (iOS Safari's limit is about 16.7 million
// pixels), so very long scrolling screenshots are scaled down to fit.
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_CANVAS_SIDE = 16_384;

/**
 * The size to redraw an image at before upload. Only the width is capped, never the height on
 * its own: capping the longest side would shrink the text of a long screenshot until it can't
 * be read. Never upscales.
 */
export function fitReceiptSize(width: number, height: number): { width: number; height: number } {
  let scale = Math.min(1, RECEIPT_MAX_WIDTH / width);
  const area = width * height * scale * scale;
  if (area > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / area);
  scale = Math.min(scale, MAX_CANVAS_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

/** The original file name, trimmed to something safe to show (or null). */
export function cleanFileName(name: string | null | undefined): string | null {
  const cleaned = (name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
  return cleaned || null;
}
