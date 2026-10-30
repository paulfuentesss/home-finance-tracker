// The payment fee added to an emailed bill (BILL_PAYMENT_FEES in lib/household-config.ts).
// Rules: docs/settlement-rules.md → "Email-imported bills".

import type { BillProvider } from "@/lib/bill-email/parse";
import { BILL_EMAIL_COLUMNS, BILL_PAYMENT_FEES } from "@/lib/household-config";
import { toCentavos, type Centavos } from "@/lib/money";

/** The fee for paying this provider's bill the usual way; `note` says what it is (null when ₱0). */
export function paymentFee(provider: BillProvider): { fee: Centavos; note: string | null } {
  const { fee, note } = BILL_PAYMENT_FEES[provider];
  const centavos = toCentavos(fee);
  return { fee: centavos, note: centavos === 0 ? null : note };
}

/**
 * The fee for the bill a Split Table column holds, when an emailed bill fills that column
 * (`BILL_EMAIL_COLUMNS`) and its fee isn't ₱0 — so a bill typed in by hand can be reminded to
 * include it. Null for any other column.
 */
export function columnPaymentFee(columnName: string): { fee: Centavos; note: string } | null {
  const provider = (Object.keys(BILL_EMAIL_COLUMNS) as BillProvider[]).find((p) => BILL_EMAIL_COLUMNS[p] === columnName);
  if (!provider) return null;
  const { fee, note } = paymentFee(provider);
  return note === null ? null : { fee, note };
}
