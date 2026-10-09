// "Preview as a housemate" (docs/features/auth.md): PA sees the month tabs as a housemate would.
// The choice is a plain cookie, set and cleared in the browser (lib/preview-browser.ts); this
// file is shared by the browser and the server. It grants nothing: the server reads it only
// when the real signed-in member is the admin (previewFor in lib/auth.ts), and refuses every
// change while it's on (run() in actions.ts).

export const PREVIEW_COOKIE = "myhouse-preview-as";

/** A housemate in PA's "Preview as…" list (getPreviewChoices in lib/auth.ts). */
export interface PreviewChoice {
  id: number;
  name: string;
  dotClass: string;
}

/** The member id in the cookie, or null when it's missing or isn't a plain positive integer. */
export function parsePreviewCookie(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
