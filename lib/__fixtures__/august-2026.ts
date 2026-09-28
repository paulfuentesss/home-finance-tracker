// August 2026, taken from the household Google Sheet (the source of truth).
// Used by the settlement tests and by `npm run db:seed:august`.

export const HOUSEHOLD_MEMBERS = [
  { name: "Ate Toni", sortOrder: 1, isCollector: false },
  { name: "Mayee", sortOrder: 2, isCollector: false },
  { name: "Skyler", sortOrder: 3, isCollector: false },
  { name: "PJ", sortOrder: 4, isCollector: false },
  // PA (Paul) usually pays the bills upfront and collects from everyone.
  { name: "PA", sortOrder: 5, isCollector: true },
] as const;

export type MemberName = (typeof HOUSEHOLD_MEMBERS)[number]["name"];
type Category = "grocery" | "food" | "service" | "misc";

/** Meralco point allocation as of April 2026 (8.3 points). */
export const MERALCO_POINTS: Record<MemberName, number> = {
  "Ate Toni": 2.5,
  Mayee: 1.5,
  Skyler: 1.5,
  PJ: 1,
  PA: 1.8,
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
      totalAmount: "15463.59",
      paidBy: "PA",
      splitMode: "points",
      points: MERALCO_POINTS,
      dueDate: "2026-09-06",
      paidOn: "2026-08-31",
    },
    { name: "Water", totalAmount: "2173.63", paidBy: "PA", splitMode: "equal", dueDate: "2026-09-03", paidOn: "2026-08-31" },
    { name: "PLDT Wifi", totalAmount: "2699.00", paidBy: "PA", splitMode: "equal", dueDate: "2026-08-30", paidOn: "2026-08-31" },
    { name: "Helper", totalAmount: "6400.00", paidBy: "PA", splitMode: "equal" },
  ],
  columns: [
    { name: DEFAULT_COLUMN, splitMode: "equal", isDefault: true },
    // PA left for BKK on Aug 8, so most later advances were shared without him.
    { name: WITHOUT_PA, splitMode: "equal", included: ["Ate Toni", "Mayee", "Skyler", "PJ"] },
    // Typed as in the sheet: Ate Toni carries half, the others 12.5% — ₱0.02 over ₱3,761.
    {
      name: ICE_MAKER,
      splitMode: "manual",
      amounts: { "Ate Toni": "1880.50", Mayee: "470.13", Skyler: "470.13", PJ: "470.13", PA: "470.13" },
    },
  ],
  advances: [
    { payer: "Skyler", description: "SM North Edsa Groceries", category: "grocery", amount: "17834.00", spentOn: "2026-07-27" },
    { payer: "Skyler", description: "SM Cherry Congre", category: "grocery", amount: "14533.00", spentOn: "2026-08-19", column: WITHOUT_PA },
    { payer: "Skyler", description: "24 Chicken Congre", category: "food", amount: "540.00", spentOn: "2026-08-19", column: WITHOUT_PA },
    { payer: "Skyler", description: "MR DIY SM Cherry Congre", category: "grocery", amount: "537.00", spentOn: "2026-08-19", column: WITHOUT_PA },
    { payer: "Skyler", description: "Cirle C Robinsons Supermarket", category: "grocery", amount: "1112.00", spentOn: "2026-08-19", column: WITHOUT_PA },
    { payer: "Skyler", description: "Chowking Congressional", category: "food", amount: "795.00", spentOn: "2026-08-31", column: WITHOUT_PA },
    { payer: "Skyler", description: "Bigas and Groceries", category: "grocery", amount: "2500.00", spentOn: "2026-08-23", column: WITHOUT_PA },
    { payer: "PA", description: "Liquid Detergent", category: "grocery", amount: "892.50", spentOn: "2026-08-03" },
    {
      payer: "PA",
      description: "Ice Maker",
      category: "misc",
      amount: "3761.00",
      spentOn: "2026-08-04",
      column: ICE_MAKER,
    },
    { payer: "Ate Toni", description: "Gas Tank", category: "misc", amount: "5732.00", spentOn: "2026-08-17" },
    { payer: "PJ", description: "Grocery", category: "grocery", amount: "13636.40", spentOn: "2026-08-19", column: WITHOUT_PA },
    { payer: "Mayee", description: "Palengke", category: "grocery", amount: "1500.00", spentOn: null },
    { payer: "Mayee", description: "Ulam", category: "food", amount: "550.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Mayee", description: "Dinner", category: "food", amount: "595.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Mayee", description: "Palengke", category: "grocery", amount: "1800.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Mayee", description: "Ulam", category: "food", amount: "700.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Mayee", description: "Bigas etc", category: "grocery", amount: "390.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Mayee", description: "Ulam ingredients", category: "grocery", amount: "400.00", spentOn: null },
    { payer: "Mayee", description: "Bread", category: "grocery", amount: "100.00", spentOn: null },
    { payer: "Mayee", description: "Washing Machine Down", category: "service", amount: "2000.00", spentOn: null, column: WITHOUT_PA },
    { payer: "Mayee", description: "Washing Machine - Antirust", category: "service", amount: "750.00", spentOn: null },
  ],
};

/** Month Finals from the household sheet (it rounds each share on its own). */
export const SHEET_MONTH_FINALS: Record<MemberName, string> = {
  "Ate Toni": "18424.53",
  Mayee: "12098.08",
  Skyler: "-16967.92",
  PJ: "6315.13",
  PA: "-19869.82",
};
