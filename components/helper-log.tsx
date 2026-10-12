"use client";

import { Pencil } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { deleteHelperEntry } from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { AddHelperEntryDialog, EditHelperEntryDialog } from "@/components/entry-dialogs";
import { Button } from "@/components/ui/button";
import { useViewer } from "@/components/viewer-context";
import { dayLabel } from "@/lib/format";
import { countsInBill } from "@/lib/helper";
import { formatPHP } from "@/lib/money";
import { canManageHelperEntry, isAdmin, isViewOnly } from "@/lib/permissions";
import type { PeriodView, ViewHelperEntry } from "@/lib/periods";
import { cn } from "@/lib/utils";

const KIND_PILLS: Record<ViewHelperEntry["kind"], { label: string; className: string }> = {
  visit: { label: "Visit", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  early_pay: { label: "Early pay", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  opening: { label: "From the sheet", className: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
};

// The Helper tab (docs/features/helper.md): her visits and early pay, like the sheet's two
// tables in one list, with what she owes after each.
export function HelperLog({ view }: { view: PeriodView }) {
  const viewer = useViewer();
  const admin = isAdmin(viewer);
  const { helper } = view;
  const open = view.period.status === "open";
  // PA logs for anyone; everyone else what they paid, if they're in this month.
  const canAdd = open && !isViewOnly(viewer) && (admin || view.members.some((m) => m.id === viewer.memberId));
  const canManage = (e: ViewHelperEntry) => open && canManageHelperEntry(viewer, e);
  const editable = open && helper.entries.some(canManage);
  const [editing, setEditing] = useState<ViewHelperEntry | null>(null);
  const nameOf = useMemo(() => new Map(view.members.map((m) => [m.id, m.name])), [view.members]);
  const helperBill = view.bills.find((b) => b.kind === "helper");
  // A Helper column typed in directly (before visits were logged here) is replaced by the first
  // visit or early pay (her starting debt doesn't count).
  const typedTotal =
    !helper.entries.some(countsInBill) && helperBill && helperBill.total > 0 ? helperBill.total : null;
  const columnCount = editable ? 8 : 7;

  const describe = (e: ViewHelperEntry) =>
    `${KIND_PILLS[e.kind].label}${e.onDate ? ` · ${dayLabel(e.onDate)}` : ""} · ${formatPHP(e.amount)}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border bg-white p-5 shadow-xs">
          <h2 className="text-sm font-medium text-muted-foreground">She owes</h2>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">{formatPHP(helper.owesNow)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Early pay not yet taken off her daily pay. {formatPHP(helper.owesAtStart)} at the start of this month.
          </p>
          {canAdd && admin && !helper.hasOpening && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              Moving over from the sheet?
              <AddHelperEntryDialog view={view} kind="opening" />
            </div>
          )}
        </section>
        <section className="rounded-xl border bg-white p-5 shadow-xs">
          <h2 className="text-sm font-medium text-muted-foreground">This month&apos;s Helper bill</h2>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">
            {formatPHP(typedTotal ?? helper.summary.handedOver)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {typedTotal !== null
              ? "Typed in on the Split Table — no visits logged here yet."
              : `Daily pay ${formatPHP(helper.summary.dailyPay)} + early pay ${formatPHP(helper.summary.earlyPay)} − taken off ${formatPHP(helper.summary.takenOff)}: what was handed to her, split equally. Whoever paid her gets it back.`}
          </p>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border bg-white shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 className="text-lg font-semibold">Visits &amp; Early Pay</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every day she worked and every early pay this month, with what she owes after each.
            </p>
          </div>
          {canAdd && (
            // Phone: the two buttons share one full-width row.
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <AddHelperEntryDialog view={view} kind="visit" />
              <AddHelperEntryDialog view={view} kind="early_pay" />
            </div>
          )}
        </div>

        {typedTotal !== null && admin && open && (
          <p className="border-b bg-amber-50/60 px-5 py-3 text-sm text-amber-900">
            This month&apos;s Helper column was typed in directly ({formatPHP(typedTotal)}). Logging the first visit or
            early pay replaces it with the total from this list, so log all of this month&apos;s visits.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {/* Phones get a two-line layout per entry, so no column headings. */}
            <thead className="hidden bg-amber-50/60 text-left text-amber-900 md:table-header-group">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Date</th>
                <th className="px-3 py-2.5 font-semibold">What</th>
                <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                <th className="px-3 py-2.5 text-right font-semibold">Taken off</th>
                <th className="px-3 py-2.5 text-right font-semibold">Handed over</th>
                <th className="px-3 py-2.5 font-semibold">Paid by</th>
                <th className="px-3 py-2.5 text-right font-semibold">She owes after</th>
                {editable && (
                  <th className="w-24 px-3 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {helper.entries.map((e) => {
                const pill = KIND_PILLS[e.kind];
                const kindPill = (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", pill.className)}>
                    {pill.label}
                  </span>
                );
                const date = e.onDate ? dayLabel(e.onDate) : "No date";
                const payer = e.payerId === null ? "—" : (nameOf.get(e.payerId) ?? "—");
                const takenOff = e.kind === "visit" && e.deduction > 0 ? `−${formatPHP(e.deduction)}` : "—";
                const handed = e.kind === "opening" ? "—" : formatPHP(e.handedOver);
                const actions = canManage(e) && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${describe(e)}`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setEditing(e)}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmDeleteButton
                      label={`Delete ${describe(e)}`}
                      title="Delete this entry?"
                      description={`${describe(e)}${e.payerId === null ? "" : ` · ${payer}`}. The Helper bill and what she owes are recalculated.`}
                      onConfirm={() => deleteHelperEntry(e.id)}
                    />
                  </>
                );
                return (
                  <Fragment key={e.id}>
                    {/* Phone: what and amount, then date, payer, note and buttons. */}
                    <tr className="border-t border-zinc-100 md:hidden">
                      <td colSpan={columnCount} className="px-5 py-2.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="flex items-center gap-2">
                            {kindPill}
                            <span className="text-muted-foreground tabular-nums">{date}</span>
                          </span>
                          <span className="shrink-0 font-mono font-semibold tabular-nums">{formatPHP(e.amount)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">
                            {e.payerId !== null && <>{payer} · </>}
                            {e.kind === "visit" && e.deduction > 0 && <>{takenOff} taken off · </>}
                            owes {formatPHP(e.owesAfter)} after
                            {e.note && <> · {e.note}</>}
                          </div>
                          {actions && <div className="-my-1 flex shrink-0">{actions}</div>}
                        </div>
                      </td>
                    </tr>
                    <tr className="hidden border-t border-zinc-100 hover:bg-zinc-50/60 md:table-row">
                      <td className="px-5 py-2.5 text-muted-foreground tabular-nums">{date}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex flex-wrap items-center gap-2">
                          {kindPill}
                          {e.note && <span className="text-muted-foreground">{e.note}</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatPHP(e.amount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular-nums">{takenOff}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">{handed}</td>
                      <td className="px-3 py-2.5">{payer}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatPHP(e.owesAfter)}</td>
                      {editable && <td className="px-3 py-2.5 text-center whitespace-nowrap">{actions}</td>}
                    </tr>
                  </Fragment>
                );
              })}
              {helper.entries.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className="py-10 text-center text-muted-foreground">
                    No visits or early pay logged this month yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {editable && <EditHelperEntryDialog view={view} entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
