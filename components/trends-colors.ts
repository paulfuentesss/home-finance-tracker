import type { Series } from "@/lib/trends";

// The Trends chart's palette, in its fixed order (the dataviz skill's validated categorical
// palette, light: adjacent colours stay apart for colour-blind eyes too). A series' `slot` picks
// its colour, so it keeps it whatever the range. Other is grey. Shared by the chart (a Client
// Component) and the Where it went table.
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const OTHER_COLOR = "#a3a19b";

export const seriesColor = (s: Series) => (s.slot === null ? OTHER_COLOR : PALETTE[s.slot % PALETTE.length]);
