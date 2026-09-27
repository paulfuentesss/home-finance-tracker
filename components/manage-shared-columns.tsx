"use client";

import { Check, ChevronDown } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import {
  deleteSharedColumn,
  renameSharedColumn,
  setSharedColumnMode,
  updateSharedColumnMembers,
  type ActionState,
} from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { AddSharedColumnDialog } from "@/components/entry-dialogs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatPHP } from "@/lib/money";
import type { PeriodView, ViewColumn } from "@/lib/periods";
import { cn } from "@/lib/utils";

export function ManageSharedColumns({ view }: { view: PeriodView }) {
  const editable = view.period.status === "open";
  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Shared Columns</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Where advances are split. &ldquo;Advances Shared&rdquo; is always there; add others when needed.
          </p>
        </div>
        {editable && <AddSharedColumnDialog view={view} />}
      </div>
      <ul className="mt-4 space-y-2">
        {view.columns.map((column) => (
          <ColumnRow key={column.id} column={column} view={view} editable={editable} />
        ))}
        {view.columns.length === 0 && (
          <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No shared columns yet — logging an advance creates &ldquo;Advances Shared&rdquo;.
          </li>
        )}
      </ul>
    </section>
  );
}

function ColumnRow({ column, view, editable }: { column: ViewColumn; view: PeriodView; editable: boolean }) {
  const [renameState, renameAction, renaming] = useActionState<ActionState, FormData>(renameSharedColumn, null);
  const [membersState, membersAction, saving] = useActionState<ActionState, FormData>(updateSharedColumnMembers, null);
  const count = view.advances.filter((a) => a.columnId === column.id).length;

  return (
    <li className="rounded-lg border bg-zinc-50/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {editable ? (
              <form action={renameAction} className="min-w-0">
                <input type="hidden" name="columnId" value={column.id} />
                <input
                  key={column.name}
                  name="name"
                  defaultValue={column.name}
                  aria-label="Column name"
                  disabled={renaming}
                  maxLength={60}
                  className="w-full rounded-md border border-transparent bg-transparent px-1 font-semibold hover:border-input focus:border-amber-500 focus:bg-white focus:outline-none"
                  onBlur={(e) => {
                    const value = e.currentTarget.value.trim();
                    if (value && value !== column.name) e.currentTarget.form?.requestSubmit();
                  }}
                />
              </form>
            ) : (
              <span className="font-semibold">{column.name}</span>
            )}
            <ModePill column={column} editable={editable} />
          </div>
          <p className="mt-0.5 px-1 text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">{formatPHP(column.total)}</span> · {count} advance
            {count === 1 ? "" : "s"}
            {column.difference !== 0 && (
              <span className="text-rose-600">
                {" "}
                · {formatPHP(Math.abs(column.difference))} {column.difference > 0 ? "over" : "short"}
              </span>
            )}
          </p>
          {renameState?.ok === false && <p className="px-1 text-xs text-destructive">{renameState.error}</p>}
        </div>
        {editable && !column.isDefault && (
          <ConfirmDeleteButton
            label={`Delete ${column.name}`}
            title={`Delete the ${column.name} column?`}
            description={
              count > 0
                ? `It still has ${count} advance(s) — delete them in the Advances Log first.`
                : "It has no advances, so nothing else changes."
            }
            onConfirm={() => deleteSharedColumn(column.id)}
          />
        )}
      </div>

      {editable && column.splitMode === "equal" && (
        <form action={membersAction} className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-sm">
          <input type="hidden" name="columnId" value={column.id} />
          <span className="text-muted-foreground">Shared by:</span>
          {view.members.map((m) => (
            <label key={m.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="included"
                value={m.id}
                defaultChecked={column.includedIds.includes(m.id)}
                className="accent-amber-600"
              />
              {m.name}
            </label>
          ))}
          <Button type="submit" size="sm" variant="outline" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {membersState?.ok === false && <span className="text-xs text-destructive">{membersState.error}</span>}
        </form>
      )}
    </li>
  );
}

const MODES = {
  equal: { label: "Auto equal", className: "bg-emerald-800", hint: "Split evenly among who's ticked" },
  manual: { label: "Manual", className: "bg-amber-900", hint: "Type each person's amount" },
} as const;
const pillBase = "shrink-0 rounded-full px-3 py-1 text-xs font-medium text-white";

/** The column's split mode; while the month is open it opens a popover to switch Auto equal ↔ Manual. */
function ModePill({ column, editable }: { column: ViewColumn; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mode = MODES[column.splitMode];
  if (!editable) return <span className={cn(pillBase, mode.className)}>{mode.label}</span>;

  const choose = (next: "equal" | "manual") => {
    setOpen(false);
    if (next === column.splitMode) return;
    startTransition(async () => {
      const result = await setSharedColumnMode(column.id, next);
      setError(result?.ok === false ? result.error : null);
    });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={`${column.name} split: ${mode.label}`}
          disabled={pending}
          className={cn(
            pillBase,
            mode.className,
            "inline-flex cursor-pointer items-center gap-1.5 pr-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          )}
        >
          {mode.label}
          <ChevronDown className="size-3 text-white/80" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 gap-0 p-1">
          <ul>
            {(["equal", "manual"] as const).map((value) => {
              const active = value === column.splitMode;
              return (
                <li key={value}>
                  <button
                    type="button"
                    onClick={() => choose(value)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-start justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-zinc-100",
                      active && "text-amber-700",
                    )}
                  >
                    <span>
                      <span className={cn("block", active && "font-medium")}>{MODES[value].label}</span>
                      <span className="block text-xs text-muted-foreground">{MODES[value].hint}</span>
                    </span>
                    {active && <Check className="mt-0.5 size-4 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}
