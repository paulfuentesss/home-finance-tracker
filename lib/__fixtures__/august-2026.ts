// August 2026 data, taken verbatim from the App.jsx prototype.
// Used by the settlement tests and by the opt-in `npm run db:seed:august`.

export const HOUSEHOLD_MEMBERS = [
  { name: "Ate Tonette", sortOrder: 1, isCollector: false },
  { name: "Mayee", sortOrder: 2, isCollector: false },
  { name: "KP", sortOrder: 3, isCollector: false },
  { name: "PJ", sortOrder: 4, isCollector: false },
  // PA (Paul) fronts the core bills and collects from everyone.
  { name: "PA", sortOrder: 5, isCollector: true },
] as const;

export type MemberName = (typeof HOUSEHOLD_MEMBERS)[number]["name"];

export const AUGUST_2026 = {
  year: 2026,
  month: 8,
  bills: [
    { name: "Meralco", totalAmount: "15463.59", paidBy: "PA" },
    { name: "Water", totalAmount: "2173.63", paidBy: "PA" },
    { name: "PLDT Wifi", totalAmount: "2699.00", paidBy: "PA" },
    { name: "Helper", totalAmount: "6400.00", paidBy: "PA" },
  ],
  advances: [
    { payer: "KP", description: "SM North Edsa Groceries", category: "grocery", amount: "17834.00", spentOn: "2026-07-27" },
    { payer: "KP", description: "SM Cherry Congre", category: "grocery", amount: "14533.00", spentOn: "2026-08-19" },
    { payer: "KP", description: "24 Chicken Congre", category: "food", amount: "540.00", spentOn: "2026-08-19" },
    { payer: "KP", description: "MR DIY SM Cherry", category: "grocery", amount: "537.00", spentOn: "2026-08-19" },
    { payer: "KP", description: "Cirle C Robinsons Supermarket", category: "grocery", amount: "1112.00", spentOn: "2026-08-19" },
    { payer: "KP", description: "Chowking Congressional", category: "food", amount: "795.00", spentOn: "2026-08-31" },
    { payer: "KP", description: "Bigas and Groceries", category: "grocery", amount: "2500.00", spentOn: "2026-08-23" },
    { payer: "PA", description: "Liquid Detergent", category: "grocery", amount: "892.50", spentOn: "2026-08-03" },
    {
      payer: "PA",
      description: "Ice Maker",
      category: "misc",
      amount: "3761.00",
      spentOn: "2026-08-04",
      // PA carries half, the other four split the other half (12.5% each).
      customWeights: { PA: 4, "Ate Tonette": 1, Mayee: 1, KP: 1, PJ: 1 },
    },
    { payer: "Ate Tonette", description: "Gas Tank", category: "misc", amount: "5732.00", spentOn: "2026-08-17" },
    { payer: "PJ", description: "Grocery", category: "grocery", amount: "13636.40", spentOn: "2026-08-19" },
    { payer: "Mayee", description: "Palengke", category: "grocery", amount: "1500.00", spentOn: "2026-08-01" },
    { payer: "Mayee", description: "Washing Machine Cleaner", category: "service", amount: "2000.00", spentOn: "2026-08-15" },
  ],
} as const satisfies {
  year: number;
  month: number;
  bills: readonly { name: string; totalAmount: string; paidBy: MemberName }[];
  advances: readonly {
    payer: MemberName;
    description: string;
    category: "grocery" | "food" | "service" | "misc";
    amount: string;
    spentOn: string;
    customWeights?: Partial<Record<MemberName, number>>;
  }[];
};
