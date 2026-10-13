// Settle Up's Compact view on phones (docs/features/settle-up.md): a plain cookie, set in the
// browser (components/settle-up.tsx) and read by the page, so a phone that picked Compact gets it
// from the first paint. Shared by the browser and the server; it holds only "1" or nothing.

export const COMPACT_COOKIE = "myhouse-settle-compact";
