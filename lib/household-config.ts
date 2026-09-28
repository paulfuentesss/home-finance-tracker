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
