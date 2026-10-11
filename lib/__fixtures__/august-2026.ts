// A made-up August 2026 — names, amounts and purchases are fictional (the repo is public; the
// real household's data lives only in the database). It has the shape of a real month and
// keeps the cases the tests need: a points tie decided by split order, leftover centavos, a
// column shared without PA, and a Manual column ₱0.02 over. Expected values in the tests were
// worked out by hand from docs/settlement-rules.md, not copied from the app's output.
// Used by the settlement tests and by `npm run db:seed:august` (local database only).

export const HOUSEHOLD_MEMBERS = [
  { name: "Ana", sortOrder: 1, isCollector: false },
  { name: "Ben", sortOrder: 2, isCollector: false },
  { name: "Cara", sortOrder: 3, isCollector: false },
  { name: "Dan", sortOrder: 4, isCollector: false },
  // PA pays the bills upfront and collects from everyone.
  { name: "PA", sortOrder: 5, isCollector: true },
] as const;

export type MemberName = (typeof HOUSEHOLD_MEMBERS)[number]["name"];
type Category = "grocery" | "food" | "service" | "misc";

/** Meralco points (8.2 in all). Ben and Cara are equal, so their shares tie. */
export const MERALCO_POINTS: Record<MemberName, number> = {
  Ana: 2.2,
  Ben: 1.5,
  Cara: 1.5,
  Dan: 1,
  PA: 2,
};

export const DEFAULT_COLUMN = "Advances Shared";
const WITHOUT_PA = "Advances Shared w/o PA";
const ICE_MAKER = "Ice Maker Adj.";

export interface FixtureBill {
  name: string;
  totalAmount: string;
  paidBy: MemberName;
  splitMode: "equal" | "points";
  points?: Record<MemberName, number>;
  dueDate?: string;
  paidOn?: string;
}

export interface FixtureColumn {
  name: string;
  splitMode: "equal" | "manual";
  isDefault?: boolean;
  /** equal: who shares it (omitted = everyone). */
  included?: MemberName[];
  /** manual: the typed amounts. */
  amounts?: Record<MemberName, string>;
}

export interface FixtureAdvance {
  payer: MemberName;
  description: string;
  category: Category;
  amount: string;
  spentOn: string | null;
  /** Shared column name; omitted = the default "Advances Shared". */
  column?: string;
}

export const AUGUST_2026: {
  year: number;
  month: number;
  bills: FixtureBill[];
  columns: FixtureColumn[];
  advances: FixtureAdvance[];
} = {
  year: 2026,
  month: 8,
  bills: [
    {
      name: "Meralco",
      totalAmount: "12507.54",
      paidBy: "PA",
      splitMode: "points",
      points: MERALCO_POINTS,
      dueDate: "2026-09-06",
      paidOn: "2026-08-31",
    },
    { name: "Water", totalAmount: "1948.63", paidBy: "PA", splitMode: "equal", dueDate: "2026-09-03", paidOn: "2026-08-31" },
    { name: "PLDT Wifi", totalAmount: "1899.00", paidBy: "PA", splitMode: "equal", dueDate: "2026-08-30", paidOn: "2026-08-31" },
    { name: "Helper", totalAmount: "5500.00", paidBy: "PA", splitMode: "equal" },
  ],
  columns: [
    { name: DEFAULT_COLUMN, splitMode: "equal", isDefault: true },
    // PA was away for most of the month, so later advances were shared without him.
    { name: WITHOUT_PA, splitMode: "equal", included: ["Ana", "Ben", "Cara", "Dan"] },
    // Typed by hand: Ana carries half, the others 12.5% each — ₱0.02 over ₱3,201.
    {
      name: ICE_MAKER,
      splitMode: "manual",
      amounts: { Ana: "1600.50", Ben: "400.13", Cara: "400.13", Dan: "400.13", PA: "400.13" },
    },
  ],
  advances: [
    { payer: "Cara", description: "Monthly groceries", category: "grocery", amount: "15420.00", spentOn: "2026-07-28" },
    { payer: "Cara", description: "Groceries", category: "grocery", amount: "12860.00", spentOn: "2026-08-19", column: WITHOUT_PA },
    { payer: "Cara", description: "Chicken dinner", category: "food", amount: "480.00", spentOn: "2026-08-19", column: WITHOUT_PA },
    { payer: "Cara", description: "Hardware store", category: "grocery", amount: "465.00", spentOn: "2026-08-19", column: WITHOUT_PA },
    { payer: "Cara", description: "Supermarket", category: "grocery", amount: "990.00", spentOn: "2026-08-19", column: WITHOUT_PA },
    { payer: "Cara", description: "Takeout dinner", category: "food", amount: "710.00", spentOn: "2026-08-31", column: WITHOUT_PA },
    { payer: "Cara", description: "Rice and groceries", category: "grocery", amount: "2200.00", spentOn: "2026-08-23", column: WITHOUT_PA },
    { payer: "PA", description: "Laundry detergent", category: "grocery", amount: "745.50", spentOn: "2026-08-03" },
    {
      payer: "PA",
      description: "Ice Maker",
      category: "misc",
      amount: "3201.00",
      spentOn: "2026-08-04",
      column: ICE_MAKER,
    },
    { payer: "Ana", description: "Gas tank refill", category: "misc", amount: "4980.00", spentOn: "2026-08-17" },
    { payer: "Dan", description: "Groceries", category: "grocery", amount: "11940.40", spentOn: "2026-08-19", column: WITHOUT_PA },
    { payer: "Ben", description: "Palengke", category: "grocery", amount: "1320.00", spentOn: null },
    { payer: "Ben", description: "Ulam", category: "food", amount: "520.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Ben", description: "Dinner", category: "food", amount: "560.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Ben", description: "Palengke", category: "grocery", amount: "1650.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Ben", description: "Ulam", category: "food", amount: "640.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Ben", description: "Rice etc", category: "grocery", amount: "345.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Ben", description: "Ulam ingredients", category: "grocery", amount: "380.00", spentOn: null },
    { payer: "Ben", description: "Bread", category: "grocery", amount: "95.00", spentOn: null },
    { payer: "Ben", description: "Washing machine repair", category: "service", amount: "1800.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Ben", description: "Washing machine - antirust", category: "service", amount: "650.00", spentOn: null },
  ],
};

/**
 * Month Finals the way a spreadsheet gets them when it rounds each share on its own (worked
 * out by hand). The app splits leftover centavos exactly instead, so it may differ by ₱0.01.
 */
export const SHEET_MONTH_FINALS: Record<MemberName, string> = {
  Ana: "15353.91",
  Ben: "10105.82",
  Cara: "-15059.18",
  Dan: "5362.77",
  PA: "-15763.29",
};
