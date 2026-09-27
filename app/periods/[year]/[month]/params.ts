import { notFound } from "next/navigation";

/** Parses /periods/[year]/[month] params; 404s on anything that isn't a real month. */
export async function parsePeriodParams(params: Promise<{ year: string; month: string }>) {
  const { year, month } = await params;
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || y < 2000 || y > 2100 || m < 1 || m > 12) notFound();
  return { year: y, month: m };
}
