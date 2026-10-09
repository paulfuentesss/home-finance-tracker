import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { monthLabel } from "@/lib/format";

type PeriodParams = Promise<{ year: string; month: string }>;

/** Parses /periods/[year]/[month] params; 404s on anything that isn't a real month. */
export async function parsePeriodParams(params: PeriodParams) {
  const { year, month } = await params;
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || y < 2000 || y > 2100 || m < 1 || m > 12) notFound();
  return { year: y, month: m };
}

/** A tab's browser title, e.g. "Advances · October 2026" (the root layout adds "· My House"). */
export async function tabMetadata(params: PeriodParams, tab: string): Promise<Metadata> {
  const { year, month } = await parsePeriodParams(params);
  return { title: `${tab} · ${monthLabel(year, month)}` };
}
