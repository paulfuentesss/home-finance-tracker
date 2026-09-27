"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { addAdvance, addBill, type ActionState } from "@/app/periods/[year]/[month]/actions";
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

export function AddAdvanceDialog({ view }: Props) {
  const [open, setOpen] = useState(false);
  // Wrapping the action lets us close the dialog on success without an effect.
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await addAdvance(prev, formData);
    if (result?.ok) setOpen(false);
    return result;
  }, null);

  const memberItems = view.members.map((m) => ({ value: String(m.id), label: m.name }));
  const categoryItems = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
  const collectorId = String(view.members.find((m) => m.isCollector)?.id ?? view.members[0]?.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="h-8 text-xs" />}>
        <Plus />
        Add advance
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add advance</DialogTitle>
          <DialogDescription>
            A household purchase someone paid for. It&apos;s split equally across everyone this month.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="periodId" value={view.period.id} />
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
          <Field label="Description" htmlFor="description">
            <Input id="description" name="description" placeholder="SM Cherry groceries" required maxLength={120} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₱)" htmlFor="amount">
              <Input id="amount" name="amount" inputMode="decimal" placeholder="1,500.00" required />
            </Field>
            <Field label="Date" htmlFor="spentOn">
              <Input id="spentOn" name="spentOn" type="date" defaultValue={todayInManila()} required />
            </Field>
          </div>
          {state?.ok === false && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add advance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddBillDialog({ view }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await addBill(prev, formData);
    if (result?.ok) setOpen(false);
    return result;
  }, null);

  const memberItems = view.members.map((m) => ({ value: String(m.id), label: m.name }));
  const collectorId = String(view.members.find((m) => m.isCollector)?.id ?? view.members[0]?.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="sm" className="h-8 text-xs" />}>
        <Plus />
        Add bill
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add bill</DialogTitle>
          <DialogDescription>
            A utility or service bill, split equally across everyone. It shows up as a new column in the matrix.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="periodId" value={view.period.id} />
          <Field label="Bill name" htmlFor="name">
            <Input id="name" name="name" placeholder="Meralco" required maxLength={60} />
          </Field>
          <Field label="Total (₱)" htmlFor="total">
            <Input id="total" name="total" inputMode="decimal" placeholder="2,699.00" required />
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

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
