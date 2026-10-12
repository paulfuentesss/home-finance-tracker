"use client";

// The Billers tab (docs/features/billers.md): one card per company the household pays, with
// its account details. PA reads it like everyone else and taps Edit to change it in place;
// housemates see the lines shared with them. Passwords
// arrive masked — Reveal fetches one at a time from /biller-secrets/<id>, which checks again.

import { Check, ChevronDown, ChevronUp, ExternalLink, Eye, EyeOff, Lock, Pencil, Users } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  deleteBiller,
  deleteBillerField,
  moveBiller,
  moveBillerField,
  renameBiller,
  setBillerFieldVisibility,
  updateBillerFieldLabel,
  updateBillerFieldValue,
  type ActionState,
} from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { CopyButton } from "@/components/copy-button";
import { AddBillerDialog, AddBillerFieldDialog, ChangeBillerSecretDialog } from "@/components/entry-dialogs";
import { InlineInput } from "@/components/inline-input";
import { Button } from "@/components/ui/button";
import { useIsPreviewing, useViewer } from "@/components/viewer-context";
import { isCopyable } from "@/lib/biller-copy";
import type { ViewBiller, ViewBillerField } from "@/lib/billers";
import { isAdmin } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** How long a revealed password stays on screen. */
const REVEAL_MS = 30_000;

export function Billers({ billers }: { billers: ViewBiller[] }) {
  // PA; false while previewing as a housemate (the page is then drawn for them).
  const admin = isAdmin(useViewer());
  // PA reads it like everyone else; Edit turns on the inputs and buttons.
  const [editing, setEditing] = useState(false);
  const edit = admin && editing;
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-white p-5 shadow-xs">
        {/* The page title above (components/period-header.tsx) names the page. */}
        <div>
          <p className="text-sm text-muted-foreground">
            Account numbers, how each bill is paid, and the logins that go with them. Passwords stay hidden until you
            tap <Eye className="inline size-3.5 align-[-2px]" aria-label="Reveal" />.
            {admin && " Lines marked Admin only aren't shown to housemates."}
          </p>
        </div>
        {admin && (
          <div className="flex flex-wrap gap-2">
            {edit && <AddBillerDialog />}
            <Button variant={edit ? "default" : "outline"} onClick={() => setEditing(!editing)}>
              {edit ? <Check /> : <Pencil />}
              {edit ? "Done" : "Edit"}
            </Button>
          </div>
        )}
      </section>
      {billers.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          {!admin ? "Nothing here yet." : edit ? "No billers yet. Add one to start." : "No billers yet. Tap Edit to add one."}
        </p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {billers.map((biller, i) => (
            <BillerCard
              key={biller.id}
              biller={biller}
              admin={admin}
              edit={edit}
              first={i === 0}
              last={i === billers.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Runs a button's Server Action and keeps its error to show next to it. */
function useRowAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const previewing = useIsPreviewing();
  const run = (action: () => Promise<ActionState>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.ok === false) setError(result.error);
    });
  };
  return { disabled: pending || previewing, error, run };
}

function MoveButtons({
  label,
  first,
  last,
  disabled,
  onMove,
}: {
  label: string;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove: (direction: "up" | "down") => void;
}) {
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Move ${label} up`} className="text-muted-foreground" disabled={disabled || first} onClick={() => onMove("up")}>
        <ChevronUp />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Move ${label} down`} className="text-muted-foreground" disabled={disabled || last} onClick={() => onMove("down")}>
        <ChevronDown />
      </Button>
    </>
  );
}

/** `admin`: the viewer is PA (shows which lines are admin only); `edit`: PA turned on Edit. */
function BillerCard({
  biller,
  admin,
  edit,
  first,
  last,
}: {
  biller: ViewBiller;
  admin: boolean;
  edit: boolean;
  first: boolean;
  last: boolean;
}) {
  const { disabled, error, run } = useRowAction();
  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        {edit ? (
          <InlineInput
            action={renameBiller}
            hidden={{ billerId: biller.id }}
            name="name"
            value={biller.name}
            label="Biller name"
            maxLength={60}
            allowEmpty={false}
            className="min-w-0 flex-1"
            inputClassName="w-full border-transparent bg-transparent px-1 text-lg font-semibold hover:border-input focus:bg-white"
          />
        ) : (
          <h2 className="text-lg font-semibold">{biller.name}</h2>
        )}
        {edit && (
          <div className="flex shrink-0 items-center">
            <MoveButtons label={biller.name} first={first} last={last} disabled={disabled} onMove={(d) => run(() => moveBiller(biller.id, d))} />
            <ConfirmDeleteButton
              label={`Delete ${biller.name}`}
              title={`Delete ${biller.name}?`}
              description="Its card and every line on it, passwords included, are deleted. Bills and months aren't affected."
              onConfirm={() => deleteBiller(biller.id)}
            />
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      <ul className="mt-3 divide-y">
        {biller.fields.map((field, i) => (
          <FieldRow
            key={field.id}
            field={field}
            admin={admin}
            edit={edit}
            first={i === 0}
            last={i === biller.fields.length - 1}
          />
        ))}
        {biller.fields.length === 0 && <li className="py-3 text-sm text-muted-foreground">No lines yet.</li>}
      </ul>
      {edit && (
        <div className="mt-2">
          <AddBillerFieldDialog billerId={biller.id} billerName={biller.name} />
        </div>
      )}
    </section>
  );
}

function FieldRow({
  field,
  admin,
  edit,
  first,
  last,
}: {
  field: ViewBillerField;
  admin: boolean;
  edit: boolean;
  first: boolean;
  last: boolean;
}) {
  const { disabled, error, run } = useRowAction();
  const heading = field.kind === "heading";

  const label = edit ? (
    <InlineInput
      action={updateBillerFieldLabel}
      hidden={{ fieldId: field.id }}
      name="label"
      value={field.label}
      label={heading ? "Heading" : "Label"}
      maxLength={60}
      allowEmpty={false}
      className="min-w-0"
      inputClassName={cn(
        "w-full border-transparent bg-transparent px-1 hover:border-input focus:bg-white",
        heading ? "font-semibold" : "text-muted-foreground",
      )}
    />
  ) : (
    <span className={cn(heading ? "font-semibold" : "text-muted-foreground")}>{field.label}</span>
  );

  return (
    <li className={cn("py-2", heading && "pt-4")}>
      <div className="flex items-start gap-2">
        <div className={cn("grid min-w-0 flex-1 gap-x-4 gap-y-0.5 text-sm", !heading && "sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
          <div className="min-w-0 self-center">{label}</div>
          {!heading && (
            <div className="min-w-0 self-center">
              {field.kind === "secret" ? <SecretValue field={field} /> : <PlainValue field={field} edit={edit} />}
            </div>
          )}
        </div>
        {admin && !field.housematesCanSee && (
          <span className="mt-1 shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Admin only
          </span>
        )}
        {edit && (
          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={field.housematesCanSee ? `Make ${field.label} admin only` : `Share ${field.label} with housemates`}
              title={field.housematesCanSee ? "Shared with housemates — tap to make it admin only" : "Admin only — tap to share with housemates"}
              className="text-muted-foreground"
              disabled={disabled}
              onClick={() => run(() => setBillerFieldVisibility(field.id, !field.housematesCanSee))}
            >
              {field.housematesCanSee ? <Users /> : <Lock />}
            </Button>
            {field.kind === "secret" && <ChangeBillerSecretDialog fieldId={field.id} label={field.label} />}
            <MoveButtons label={field.label} first={first} last={last} disabled={disabled} onMove={(d) => run(() => moveBillerField(field.id, d))} />
            <ConfirmDeleteButton
              label={`Delete ${field.label}`}
              title={`Delete “${field.label}”?`}
              description={field.kind === "secret" ? "The saved password is deleted with it." : "This line is removed from the card."}
              onConfirm={() => deleteBillerField(field.id)}
            />
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </li>
  );
}

function PlainValue({ field, edit }: { field: ViewBillerField; edit: boolean }) {
  const value = field.value ?? "";
  const link = field.kind === "link" && value !== "";
  return (
    <div className="flex min-w-0 items-center gap-1">
      {edit ? (
        <InlineInput
          action={updateBillerFieldValue}
          hidden={{ fieldId: field.id }}
          name="value"
          value={value}
          label={field.label}
          maxLength={500}
          className="min-w-0 flex-1"
          inputClassName="w-full border-transparent bg-transparent px-1 hover:border-input focus:bg-white"
        />
      ) : link ? (
        <a href={value} target="_blank" rel="noreferrer" className="min-w-0 break-all text-amber-700 underline-offset-2 hover:underline">
          {value}
        </a>
      ) : (
        <span className="min-w-0 break-words">{value || "—"}</span>
      )}
      {edit && link && (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${field.label}`}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-zinc-100"
        >
          <ExternalLink className="size-4" />
        </a>
      )}
      {field.kind === "text" && isCopyable(value) && <CopyButton value={value} label={field.label} />}
    </div>
  );
}

function SecretValue({ field }: { field: ViewBillerField }) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hidden again after a while, so it isn't left on screen.
  useEffect(() => {
    if (value === null) return;
    const timer = setTimeout(() => setValue(null), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [value]);

  if (!field.hasSecret) return <span className="text-muted-foreground italic">Not set</span>;

  const reveal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/biller-secrets/${field.id}`, { cache: "no-store" });
      // Signed out: the request was sent on to the login page instead.
      if (res.redirected) return setError("You're signed out — reload the page and sign in again.");
      if (res.status === 404) return setError("It's gone — reload the page.");
      if (!res.ok) return setError(res.status === 500 ? "Couldn't unlock it — tell the admin." : "Couldn't show it. Please try again.");
      const body = (await res.json()) as { value: string };
      setValue(body.value);
    } catch {
      setError("Couldn't show it. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        <span className={cn("min-w-0 px-1 font-mono break-all", value === null && "tracking-widest text-muted-foreground")}>
          {value ?? "••••••••"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={value === null ? `Reveal ${field.label}` : `Hide ${field.label}`}
          className="text-muted-foreground"
          disabled={loading}
          onClick={value === null ? reveal : () => setValue(null)}
        >
          {value === null ? <Eye /> : <EyeOff />}
        </Button>
        {value !== null && <CopyButton value={value} label={field.label} />}
      </div>
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
