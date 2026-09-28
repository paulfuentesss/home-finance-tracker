// The payment fee added to an emailed bill (BILL_PAYMENT_FEES in lib/household-config.ts).
// Rules: docs/settlement-rules.md → "Email-imported bills".

import type { BillProvider } from "@/lib/bill-email/parse";
import { BILL_PAYMENT_FEES } from "@/lib/household-config";
import { toCentavos, type Centavos } from "@/lib/money";

/** The fee for paying this provider's bill the usual way; `note` says what it is (null when ₱0). */
export function paymentFee(provider: BillProvider): { fee: Centavos; note: string | null } {
  const { fee, note } = BILL_PAYMENT_FEES[provider];
  const centavos = toCentavos(fee);
  return { fee: centavos, note: centavos === 0 ? null : note };
}
