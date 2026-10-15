import { redirect } from "next/navigation";
import { AdvancesLog } from "@/components/advances-log";
import { AdvancesReport } from "@/components/advances-report";
import { PageEnter } from "@/components/page-enter";
import { columnFilterFrom } from "@/lib/advances-log";
import { getPeriodView } from "@/lib/periods";
import { parsePeriodParams, tabMetadata } from "../params";

export const generateMetadata = ({ params }: PageProps<"/periods/[year]/[month]/advances">) =>
  tabMetadata(params, "Advances");

// Tab 2: Advances Log & Report.
export default async function AdvancesPage({ params, searchParams }: PageProps<"/periods/[year]/[month]/advances">) {
  const { year, month } = await parsePeriodParams(params);
  const view = (await getPeriodView(year, month))!;
  // `?column=<id>` filters the log (AdvancesLog reads it). One that isn't a column of this month
  // (deleted since, garbage) is dropped with a redirect, so the address bar never carries a
  // filter that does nothing. Done here, not in a client effect: on a first load that effect can
  // run before Next takes over the browser history. (Under loading.tsx, Next carries the redirect
  // out in the browser, after the placeholder shows — fine for an old bookmark.)
  const { column } = await searchParams;
  // A repeated param comes as a list; the browser's useSearchParams().get() takes the first.
  const first = Array.isArray(column) ? (column[0] ?? null) : (column ?? null);
  if (column !== undefined && columnFilterFrom(first, view.columns) === null) {
    redirect(`/periods/${year}/${month}/advances`);
  }
  return (
    <PageEnter className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <AdvancesLog view={view} />
      <AdvancesReport view={view} />
    </PageEnter>
  );
}
