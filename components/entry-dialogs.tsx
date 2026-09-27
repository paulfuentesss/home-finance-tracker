"use client";

import { Plus, UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { addAdvance, addBill, addMember, type ActionState } from "@/app/periods/[year]/[month]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_LABELS, todayInManila } from "@/lib/format";
import type { PeriodView } from "@/lib/periods";

interface Props {
  view: PeriodView;
}

/** useActionState that closes the dialog on success (no effect needed). */
function useDialogAction(action: (prev: ActionState, formData: FormData) => Promise<ActionState>) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result?.ok) setOpen(false);
    return result;
  }, null);
  return { open, setOpen, state, formAction, pending };
}

export function AddAdvanceDialog({ view }: Props) {
  const { open, setOpen, state, formAction, pending } = useDialogAction(addAdvance);
  const [sharedMode, setSharedMode] = useState<"all" | "except">("all");

  const memberItems = view.members.map((m) => ({ value: String(m.id), label: m.name }));
  const categoryItems = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
  const collectorId = String(view.members.find((m) => m.isCollector)?.id ?? view.members[0]?.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        Log new advance
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log new advance</DialogTitle>
          <DialogDescription>A household purchase someone paid for themselves.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="periodId" value={view.period.id} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid by" htmlFor="payerId">
              <Select name="payerId" items={memberItems} defaultValue={collectorId}>
                <SelectTrigger id="payerId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {memberItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category" htmlFor="category">
              <Select name="category" items={categoryItems} defaultValue="grocery">
                <SelectTrigger id="category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor="description">
            <Input id="description" name="description" placeholder="SM Cherry groceries" required maxLength={120} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₱)" htmlFor="amount">
              <Input id="amount" name="amount" inputMode="decimal" placeholder="1,500.00" required />
            </Field>
            <Field label="Date (optional)" htmlFor="spentOn">
              <Input id="spentOn" name="spentOn" type="date" defaultValue={todayInManila()} />
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Shared by</legend>
            <div className="flex gap-4 text-sm">
              {(["all", "except"] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sharedMode"
                    value={mode}
                    checked={sharedMode === mode}
                    onChange={() => setSharedMode(mode)}
                    className="accent-amber-600"
                  />
                  {mode === "all" ? "Everyone" : "Everyone except…"}
                </label>
              ))}
            </div>
            {sharedMode === "except" && (
              <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg bg-zinc-50 p-3 text-sm">
                {view.members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2">
                    <input type="checkbox" name="excluded" value={m.id} className="accent-amber-600" />
                    {m.name}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave someone out when they weren&apos;t around (e.g. away on a trip). Split equally among the rest.
            </p>
          </fieldset>
          {state?.ok === false && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log advance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddBillDialog({ view, label = "Add bill column" }: Props & { label?: string }) {
  const { open, setOpen, state, formAction, pending } = useDialogAction(addBill);
  const memberItems = view.members.map((m) => ({ value: String(m.id), label: m.name }));
  const collectorId = String(view.members.find((m) => m.isCollector)?.id ?? view.members[0]?.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        {label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add bill column</DialogTitle>
          <DialogDescription>
            A utility or service bill. It starts as an equal split — switch it to Points or Manual in the table.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="periodId" value={view.period.id} />
          <Field label="Bill name" htmlFor="name">
            <Input id="name" name="name" placeholder="Meralco" required maxLength={60} />
          </Field>
          <Field label="Total (₱)" htmlFor="total">
            <Input id="total" name="total" inputMode="decimal" placeholder="0.00 if not in yet" defaultValue="0" required />
          </Field>
          <Field label="Paid to the provider by" htmlFor="paidById">
            <Select name="paidById" items={memberItems} defaultValue={collectorId}>
              <SelectTrigger id="paidById" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {memberItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {state?.ok === false && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add bill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddMemberDialog() {
  const { open, setOpen, state, formAction, pending } = useDialogAction(addMember);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UserPlus />
        Add member
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add housemate</DialogTitle>
          <DialogDescription>
            They join every open month: equal bills are re-split to include them, and points bills give them 0 points
            until you set theirs.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <Field label="Name" htmlFor="member-name">
            <Input id="member-name" name="name" placeholder="Name" required maxLength={40} />
          </Field>
          {state?.ok === false && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add housemate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
