// Reads the amount, due date, billing period and bill month out of a provider's bill email.
// Pure (no DB) and covered by parse.test.ts against the real August 2026 emails.
// Rules: docs/settlement-rules.md → "Email-imported bills".

import { parseMoneyInput, type Centavos } from "@/lib/money";

export type BillProvider = "meralco" | "water" | "pldt";

/** An email as the inbound webhook (or `npm run bills:import`) hands it over. */
export interface BillEmail {
  /** The Message-ID header; makes importing the same email twice a no-op. */
  messageId: string;
  from: string;
  subject: string;
  /** ISO timestamp. */
  receivedAt: string;
  /** Plain-text body. */
  text: string;
}

export interface ParsedBill {
  provider: BillProvider;
  amount: Centavos;
  /** "YYYY-MM-DD" */
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** The month whose Split Table the bill belongs to. */
  year: number;
  month: number;
}

export type ParseResult =
  | { ok: true; bill: ParsedBill }
  | { ok: false; provider: BillProvider | null; reason: string };

// Each provider's sender domain and the line holding this month's charges. PLDT's "Total
// Amount Due" would include an unpaid previous balance, so its "Current Charges" is used.
const PROVIDERS: Record<BillProvider, { domain: string; name: string; amountLabel: string }> = {
  meralco: { domain: "meralco.com.ph", name: "Meralco", amountLabel: "Current Amount Due" },
  water: { domain: "manilawater.com", name: "Manila Water", amountLabel: "Total Amount Due" },
  pldt: { domain: "pldt.com.ph", name: "PLDT", amountLabel: "Current Charges" },
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAME = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

/** Which provider sent it, from the sender's domain (subdomains count; lookalikes don't). */
export function providerOf(from: string): BillProvider | null {
  const address = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
  const domain = address.split("@")[1] ?? "";
  for (const [provider, { domain: d }] of Object.entries(PROVIDERS) as [BillProvider, { domain: string }][]) {
    if (domain === d || domain.endsWith(`.${d}`)) return provider;
  }
  return null;
}

export function parseBillEmail(email: BillEmail): ParseResult {
  const provider = providerOf(email.from);
  if (!provider) return { ok: false, provider: null, reason: `Not from a known bill sender (${email.from}).` };
  const { name, amountLabel } = PROVIDERS[provider];
  const text = `${email.subject}\n${email.text}`;

  const rawAmount = field(text, amountLabel);
  const amount = rawAmount === null ? null : parseMoneyInput(rawAmount.replace(/^(PHP|Php)\s*/, ""));
  if (amount === null) {
    return { ok: false, provider, reason: `No "${amountLabel}" found — this ${name} email doesn't look like a bill.` };
  }

  const dueRaw = field(text, "Due Date");
  const dueDate = dueRaw === null ? null : parseDate(dueRaw);
  const periodRaw = field(text, "Billing Period");
  const [startRaw, endRaw] = periodRaw?.split(/\s+to\s+/i) ?? [];
  const periodStart = startRaw ? parseDate(startRaw) : null;
  const periodEnd = endRaw ? parseDate(endRaw) : null;

  const month = billMonth(text, periodStart, periodEnd);
  if (!month) return { ok: false, provider, reason: `Couldn't tell which month this ${name} bill is for.` };

  return { ok: true, bill: { provider, amount, dueDate, periodStart, periodEnd, ...month } };
}

/**
 * The bill's month: the one the provider names ("bill for August 2026", "Invoice for the Month
 * of August 2026", "eInvoice for August 2026"), which is how the household sheet assigns bills.
 * If none is named, the month holding the middle of the billing period.
 */
export function billMonth(
  text: string,
  periodStart: string | null,
  periodEnd: string | null,
): { year: number; month: number } | null {
  const named = text.match(new RegExp(`\\bfor (?:the month of )?${MONTH_NAME} (\\d{4})\\b`, "i"));
  if (named) return { year: Number(named[2]), month: monthIndex(named[1]) + 1 };
  if (periodStart && periodEnd) {
    const start = Date.parse(`${periodStart}T00:00:00Z`);
    const end = Date.parse(`${periodEnd}T00:00:00Z`);
    if (end >= start) {
      const mid = new Date(start + (end - start) / 2);
      return { year: mid.getUTCFullYear(), month: mid.getUTCMonth() + 1 };
    }
  }
  return null;
}

/**
 * The value after "Label:" on the same line. Handles "Label: value", "| Label: | value |"
 * and "| Label | : | value |" (the plain-text versions of the providers' tables).
 */
function field(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}[ \\t]*\\|?[ \\t]*:[ \\t]*\\|?[ \\t]*([^|\\n]+)`, "i"));
  const value = match?.[1].trim();
  return value ? value : null;
}

/** "06 September 2026", "03 Sep 2026" or "August 30, 2026" → "2026-09-06". */
export function parseDate(raw: string): string | null {
  const dayFirst = raw.match(new RegExp(`^(\\d{1,2})\\s+${MONTH_NAME}\\.?\\s+(\\d{4})$`, "i"));
  const monthFirst = raw.match(new RegExp(`^${MONTH_NAME}\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i"));
  const [day, name, year] = dayFirst
    ? [dayFirst[1], dayFirst[2], dayFirst[3]]
    : monthFirst
      ? [monthFirst[2], monthFirst[1], monthFirst[3]]
      : [];
  if (!day || !name || !year) return null;
  const month = monthIndex(name) + 1;
  const date = new Date(Date.UTC(Number(year), month - 1, Number(day)));
  if (date.getUTCMonth() !== month - 1) return null; // e.g. 31 June
  return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase());
}
