// Runs in the browser before a receipt is uploaded (docs/features/receipts.md): redraws images
// as JPEG, which turns a 1–3 MB phone screenshot into a few hundred KB and drops the photo's
// hidden details (EXIF: location, camera). The server checks the result again
// (lib/receipts.ts), so this is only about size and privacy, not safety.

import { fitReceiptSize } from "@/lib/receipts";

const JPEG_QUALITY = 0.85;

export async function prepareReceiptFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    // Applies the photo's rotation, so it isn't sideways once EXIF is gone. Older Safari
    // doesn't know this option and throws; its default does the same thing.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() =>
      createImageBitmap(file),
    );
    const { width, height } = fitReceiptSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // JPEG has no transparency: without a white background, a transparent PNG turns black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.type !== "image/jpeg") return file;
    return new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // The browser can't read it (e.g. an iPhone HEIC photo in Chrome): send it as it is, and
    // the server says which types work.
    return file;
  }
}
