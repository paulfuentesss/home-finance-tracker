// Household facts that aren't stored in the database, shown on the "How it works" page.
// Edit here when the allocation changes.

/** What the Meralco points are based on (from the household sheet). */
export const MERALCO_POINT_ITEMS = [
  { item: "General electricity", points: 1 },
  { item: "Aircon", points: 1 },
  { item: "PA's PC", points: 0.3 },
] as const;

/** When the current Meralco point allocation was agreed. */
export const MERALCO_POINTS_AS_OF = "April 2026";

/** The Split Table column each emailed bill fills (docs/settlement-rules.md → "Email-imported bills"). */
export const BILL_EMAIL_COLUMNS = {
  meralco: "Meralco",
  water: "Water",
  pldt: "PLDT Wifi",
} as const;

/**
 * The fixed fee each way of paying adds on top of the emailed bill. It's added to the bill
 * when the email is imported, split by everyone like the bill itself, and shown as a note on
 * the column. Update it when PA changes how a bill is paid; bills already imported keep the
 * fee they were imported with. Amounts are strings (pesos), converted with toCentavos.
 */
export const BILL_PAYMENT_FEES = {
  meralco: { fee: "15.00", note: "Bayad app convenience fee" },
  water: { fee: "7.00", note: "Dragonpay fee (Manila Water QR)" },
  pldt: { fee: "0.00", note: null },
} as const;
