"use client";

import { Columns3, HandCoins, Plus, UserPlus } from "lucide-react";
import { startTransition, useActionState, useRef, useState } from "react";
import {
  addAdvance,
  addBill,
  addMember,
  addPayment,
  addSharedColumn,
  submitPayment,
  updateAdvance,
  updatePayment,
  type ActionState,
} from "@/app/periods/[year]/[month]/actions";
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
import { useIsPreviewing, useViewer } from "@/components/viewer-context";
import { CATEGORY_LABELS, todayInManila } from "@/lib/format";
import { formatPHP, fromCentavos, parseMoneyInput, type Centavos } from "@/lib/money";
import { isAdmin } from "@/lib/permissions";
import type { PeriodView, ViewAdvance, ViewPayment } from "@/lib/periods";
import { prepareReceiptFile } from "@/lib/receipt-image";
import { MAX_RECEIPT_BYTES } from "@/lib/receipts";

interface Props {
  view: PeriodView;
}

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Runs a dialog form's Server Action. The forms live inside DialogContent, which unmounts on
 * close, so every open starts without an old error.
 *
 * Submits through onSubmit instead of <form action>: React resets a form after every
 * `action` — even one that returned an error — which would wipe everything typed so far
 * because of one mistyped amount.
 *
 * `prepare` runs first, in the browser (e.g. shrinking a screenshot); it returns the form data
 * to send, or an error to show instead of sending.
 */
function useDialogForm(
  action: Action,
  onSuccess: (formData: FormData) => void,
  prepare?: (formData: FormData) => Promise<FormData | { error: string }>,
) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result?.ok) onSuccess(formData);
    return result;
  }, null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  // While PA previews as a housemate the form can be looked at, not sent.
  const previewing = useIsPreviewing();
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (previewing || preparing) return;
    const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    let ready: FormData | { error: string } = formData;
    if (prepare) {
      setPrepareError(null);
      setPreparing(true);
      try {
        ready = await prepare(formData);
      } finally {
        setPreparing(false);
      }
    }
    if (!(ready instanceof FormData)) return setPrepareError(ready.error);
    startTransition(() => dispatch(ready));
  };
  const shown: ActionState = prepareError ? { ok: false, error: prepareError } : state;
  return { state: shown, pending: pending || preparing, previewing, onSubmit };
}

export function AddAdvanceDialog({ view }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        Log new advance
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <AdvanceForm view={view} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Edits an existing advance (open while `advance` is set). Changing the column moves it. */
export function EditAdvanceDialog({
  view,
  advance,
  onClose,
}: Props & { advance: ViewAdvance | null; onClose: () => void }) {
  return (
    <Dialog open={advance !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {advance && <AdvanceForm key={advance.id} view={view} advance={advance} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Log a new advance, or edit one when `advance` is given. When adding, "Save & add another"
 * keeps the dialog open with the same payer, category, date and column, ready for the next
 * receipt.
 */
function AdvanceForm({ view, advance, onDone }: Props & { advance?: ViewAdvance; onDone: () => void }) {
  // Housemates log their own advances into the default column; only PA picks the payer and
  // column. (The server forces the same, whatever this form sends.)
  const viewer = useViewer();
  const admin = isAdmin(viewer);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const [logged, setLogged] = useState<string | null>(null);
  const { state, pending, previewing, onSubmit } = useDialogForm(advance ? updateAdvance : addAdvance, (formData) => {
    if (formData.get("intent") !== "another") return onDone();
    const amount = parseMoneyInput(String(formData.get("amount")));
    setLogged(`Logged ${formData.get("description")}${amount === null ? "" : ` · ${formatPHP(amount)}`}`);
    descriptionRef.current!.value = "";
    amountRef.current!.value = "";
    descriptionRef.current!.focus();
  });

  const memberItems = view.members.map((m) => ({ value: String(m.id), label: m.name }));
  const categoryItems = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
  const collectorId = String(view.members.find((m) => m.isCollector)?.id ?? view.members[0]?.id);
  // "0" = the default "Advances Shared" column (created automatically if the month has none).
  const defaultColumn = view.columns.find((c) => c.isDefault);
  const columnItems = [
    ...(defaultColumn ? [] : [{ value: "0", label: "Advances Shared" }]),
    ...view.columns.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{advance ? "Edit advance" : "Log new advance"}</DialogTitle>
        <DialogDescription>
          {advance
            ? "Fix a detail, or pick another column to move it. Everyone's shares are recalculated."
            : "A household purchase someone paid for themselves."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {advance ? (
          <input type="hidden" name="advanceId" value={advance.id} />
        ) : (
          <input type="hidden" name="periodId" value={view.period.id} />
        )}
        <div className="grid grid-cols-2 gap-3">
          {admin ? (
            <Field label="Paid by" htmlFor="payerId">
              <SelectField id="payerId" items={memberItems} defaultValue={advance ? String(advance.payerId) : collectorId} />
            </Field>
          ) : (
            // A hidden field, not a disabled select: disabled fields aren't submitted.
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Paid by</span>
              <span className="flex h-8 items-center text-sm">{viewer.name}</span>
              <input type="hidden" name="payerId" value={viewer.memberId} />
            </div>
          )}
          <Field label="Category" htmlFor="category">
            <SelectField id="category" items={categoryItems} defaultValue={advance?.category ?? "grocery"} />
          </Field>
        </div>
        <Field label="Description" htmlFor="description">
          <Input
            ref={descriptionRef}
            id="description"
            name="description"
            placeholder="Weekly groceries"
            defaultValue={advance?.description}
            required
            maxLength={120}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₱)" htmlFor="amount">
            <Input
              ref={amountRef}
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="1,500.00"
              defaultValue={advance ? fromCentavos(advance.amount) : undefined}
              required
            />
          </Field>
          <Field label="Date (optional)" htmlFor="spentOn">
            <Input
              id="spentOn"
              name="spentOn"
              type="date"
              defaultValue={advance ? (advance.spentOn ?? "") : todayInManila()}
            />
          </Field>
        </div>
        {admin ? (
          <Field label="Column" htmlFor="columnId">
            <SelectField
              id="columnId"
              items={columnItems}
              defaultValue={String(advance?.columnId ?? defaultColumn?.id ?? 0)}
            />
            <p className="text-xs text-muted-foreground">
              Which shared column this goes into. Need a new one (e.g. someone away)? Add a shared column in Manage
              first.
            </p>
          </Field>
        ) : (
          <p className="text-xs text-muted-foreground">
            Goes into {defaultColumn?.name ?? "Advances Shared"}, split by everyone. If it should be split
            differently, ask the admin to move it.
            <input type="hidden" name="columnId" value="0" />
          </p>
        )}
        {state?.ok === false && <p className="text-sm text-destructive">{state.error}</p>}
        {state?.ok && logged && <p className="text-sm text-emerald-700">{logged}</p>}
        {previewing && <p className="text-sm text-sky-800">You&apos;re previewing, so saving is off.</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>{logged ? "Done" : "Cancel"}</DialogClose>
          {/* First submit button in the markup = what Enter does, so the main action comes first. */}
          <Button type="submit" disabled={pending || previewing} className="sm:order-last">
            {pending ? "Saving…" : advance ? "Save changes" : "Log advance"}
          </Button>
          {!advance && (
            <Button type="submit" name="intent" value="another" variant="outline" disabled={pending || previewing}>
              Save &amp; add another
            </Button>
          )}
        </DialogFooter>
      </form>
    </>
  );
}

export interface PaymentPrefill {
  fromMemberId: number;
  toMemberId: number;
  /** What they owe, pre-filled; change it for a partial payment. */
  amount: Centavos;
}

/**
 * Records a payment. From a "Who still owes" row it opens pre-filled (who, to whom, the full
 * amount); without `prefill` it's for any other payment between two people.
 */
export function RecordPaymentDialog({
  view,
  prefill,
  label,
  variant = "default",
  className,
}: Props & {
  prefill?: PaymentPrefill;
  label: React.ReactNode;
  variant?: "default" | "outline";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} className={className} />}>
        <HandCoins />
        {label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <PaymentForm view={view} prefill={prefill} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Edits a recorded payment (open while `payment` is set). */
export function EditPaymentDialog({
  view,
  payment,
  onClose,
}: Props & { payment: ViewPayment | null; onClose: () => void }) {
  return (
    <Dialog open={payment !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {payment && <PaymentForm key={payment.id} view={view} payment={payment} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A housemate's "I paid" (docs/features/settle-up.md): the amount (pre-filled with what they
 * owe), the date, and the transfer's screenshot, which is required. It goes to the collector
 * and waits for them to confirm it; the server sets who paid whom.
 */
export function SubmitPaymentDialog({
  view,
  owed,
  waiting,
  className,
}: Props & {
  /** What they owe now (confirmed payments only), pre-filled. */
  owed: Centavos;
  /** What they've already sent that's still waiting for PA. */
  waiting: Centavos;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className={className} />}>
        <HandCoins />I paid
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <SubmitPaymentForm view={view} owed={owed} waiting={waiting} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Shrinks the screenshot in the browser (like Attach proof) before it's sent. */
async function prepareProof(formData: FormData): Promise<FormData | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Attach the screenshot of your transfer." };
  const smaller = await prepareReceiptFile(file);
  if (smaller.size > MAX_RECEIPT_BYTES) {
    return { error: `That screenshot is too large (the limit is ${MAX_RECEIPT_BYTES / 1024 / 1024} MB).` };
  }
  formData.set("file", smaller);
  return formData;
}

function SubmitPaymentForm({
  view,
  owed,
  waiting,
  onDone,
}: Props & { owed: Centavos; waiting: Centavos; onDone: () => void }) {
  const { state, pending, previewing, onSubmit } = useDialogForm(submitPayment, onDone, prepareProof);
  const [typed, setTyped] = useState(owed > 0 ? fromCentavos(owed) : "");
  const typedAmount = parseMoneyInput(typed);
  const collector = view.members.find((m) => m.isCollector)?.name ?? "PA";

  return (
    <>
      <DialogHeader>
        <DialogTitle>I paid {collector}</DialogTitle>
        <DialogDescription>
          Attach the screenshot of your transfer. It shows as waiting until {collector} checks it arrived, then it
          comes off what you owe.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="periodId" value={view.period.id} />
        {waiting > 0 && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {formatPHP(waiting)} you sent is already waiting for {collector}. Only send this if it&apos;s another
            payment.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₱)" htmlFor="amount">
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="1,500.00"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              required
            />
          </Field>
          <Field label="Date paid" htmlFor="paidOn">
            <Input id="paidOn" name="paidOn" type="date" defaultValue={todayInManila()} required />
          </Field>
        </div>
        {owed > 0 && typedAmount !== null && typedAmount > owed && (
          <p className="text-xs text-amber-700">
            More than the {formatPHP(owed)} you owe. {collector} will owe you the difference.
          </p>
        )}
        <Field label="Screenshot of the transfer" htmlFor="file">
          {/* No `capture`: that would force the camera, and most proofs are screenshots. */}
          <Input id="file" name="file" type="file" accept="image/*" required />
        </Field>
        <Field label="Note (optional)" htmlFor="note">
          <Input id="note" name="note" placeholder="GCash" maxLength={120} />
        </Field>
        {state?.ok === false && <p className="text-sm text-destructive">{state.error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button type="submit" disabled={pending || previewing}>
            {pending ? "Sending…" : "Send to " + collector}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function PaymentForm({
  view,
  payment,
  prefill,
  onDone,
}: Props & { payment?: ViewPayment; prefill?: PaymentPrefill; onDone: () => void }) {
  const { state, pending, previewing, onSubmit } = useDialogForm(payment ? updatePayment : addPayment, onDone);
  const [typed, setTyped] = useState(prefill ? fromCentavos(prefill.amount) : "");
  const typedAmount = parseMoneyInput(typed);
  const nameOf = new Map(view.members.map((m) => [m.id, m.name]));
  const memberItems = view.members.map((m) => ({ value: String(m.id), label: m.name }));
  const collector = view.members.find((m) => m.isCollector) ?? view.members[0];
  const firstOther = view.members.find((m) => m.id !== collector?.id) ?? collector;
  const from = payment?.fromMemberId ?? prefill?.fromMemberId ?? firstOther?.id;
  const to = payment?.toMemberId ?? prefill?.toMemberId ?? collector?.id;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{payment ? "Edit payment" : "Record payment"}</DialogTitle>
        <DialogDescription>
          {prefill
            ? `${nameOf.get(prefill.fromMemberId)} → ${nameOf.get(prefill.toMemberId)}. Change the amount if it was only part of it.`
            : "Money that changed hands to settle up. It comes off the payer's Final and the receiver's."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {payment ? (
          <input type="hidden" name="paymentId" value={payment.id} />
        ) : (
          <input type="hidden" name="periodId" value={view.period.id} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid by" htmlFor="fromMemberId">
            <SelectField id="fromMemberId" items={memberItems} defaultValue={String(from)} />
          </Field>
          <Field label="Paid to" htmlFor="toMemberId">
            <SelectField id="toMemberId" items={memberItems} defaultValue={String(to)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₱)" htmlFor="amount">
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="1,500.00"
              defaultValue={payment ? fromCentavos(payment.amount) : typed}
              onChange={(e) => setTyped(e.target.value)}
              required
            />
          </Field>
          <Field label="Date paid" htmlFor="paidOn">
            <Input id="paidOn" name="paidOn" type="date" defaultValue={payment?.paidOn ?? todayInManila()} required />
          </Field>
        </div>
        {prefill && typedAmount !== null && typedAmount > prefill.amount && (
          <p className="text-xs text-amber-700">
            More than the {formatPHP(prefill.amount)} owed. {nameOf.get(prefill.fromMemberId)} will be owed the
            difference.
          </p>
        )}
        <Field label="Note (optional)" htmlFor="note">
          <Input id="note" name="note" placeholder="GCash" defaultValue={payment?.note ?? ""} maxLength={120} />
        </Field>
        {state?.ok === false && <p className="text-sm text-destructive">{state.error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button type="submit" disabled={pending || previewing}>
            {pending ? "Saving…" : payment ? "Save changes" : "Record payment"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function AddBillDialog({ view, label = "Add bill column" }: Props & { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        {label}
      </DialogTrigger>
      <DialogContent>
        <AddBillForm view={view} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddBillForm({ view, onDone }: Props & { onDone: () => void }) {
  const { state, pending, previewing, onSubmit } = useDialogForm(addBill, onDone);
  const [splitMode, setSplitMode] = useState<"equal" | "manual">("equal");
  const memberItems = view.members.map((m) => ({ value: String(m.id), label: m.name }));
  const collectorId = String(view.members.find((m) => m.isCollector)?.id ?? view.members[0]?.id);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add bill column</DialogTitle>
        <DialogDescription>
          A utility or service bill. Choose how it&apos;s split — this stays fixed for the column.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="periodId" value={view.period.id} />
        <Field label="Bill name" htmlFor="name">
          <Input id="name" name="name" placeholder="Meralco" required maxLength={60} />
        </Field>
        <ModeChoice
          value={splitMode}
          onChange={setSplitMode}
          equalHint="Everyone pays the same share of the total."
          manualHint="Type each person's amount in the table; the total is their sum."
        />
        {splitMode === "equal" && (
          <Field label="Total (₱)" htmlFor="total">
            <Input id="total" name="total" inputMode="decimal" placeholder="0.00 if not in yet" defaultValue="0" required />
          </Field>
        )}
        <Field label="Paid to the provider by" htmlFor="paidById">
          <SelectField id="paidById" items={memberItems} defaultValue={collectorId} />
        </Field>
        {state?.ok === false && <p className="text-sm text-destructive">{state.error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button type="submit" disabled={pending || previewing}>
            {pending ? "Saving…" : "Add bill"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UserPlus />
        Add member
      </DialogTrigger>
      <DialogContent>
        <AddMemberForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddMemberForm({ onDone }: { onDone: () => void }) {
  const { state, pending, previewing, onSubmit } = useDialogForm(addMember, onDone);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add housemate</DialogTitle>
        <DialogDescription>
          They join every open month: equal bills are re-split to include them, and points bills give them 0 points
          until you set theirs.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field label="Name" htmlFor="member-name">
          <Input id="member-name" name="name" placeholder="Name" required maxLength={40} />
        </Field>
        {state?.ok === false && <p className="text-sm text-destructive">{state.error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button type="submit" disabled={pending || previewing}>
            {pending ? "Adding…" : "Add housemate"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function AddSharedColumnDialog({ view }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Columns3 />
        Add shared column
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <AddSharedColumnForm view={view} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddSharedColumnForm({ view, onDone }: Props & { onDone: () => void }) {
  const { state, pending, previewing, onSubmit } = useDialogForm(addSharedColumn, onDone);
  const [splitMode, setSplitMode] = useState<"equal" | "manual">("equal");
  const [sharedMode, setSharedMode] = useState<"all" | "except">("all");

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add shared column</DialogTitle>
        <DialogDescription>
          For advances that aren&apos;t shared the usual way — e.g. &ldquo;Advances Shared w/o PA&rdquo; while someone
          is away, or &ldquo;Ice Maker Adj.&rdquo; when one person carries more.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="periodId" value={view.period.id} />
        <Field label="Column name" htmlFor="column-name">
          <Input id="column-name" name="name" placeholder="Advances Shared w/o PA" required maxLength={60} />
        </Field>
        <ModeChoice
          value={splitMode}
          onChange={setSplitMode}
          equalHint="Split evenly among the people you pick."
          manualHint="Type each person's amount in the table."
        />
        {splitMode === "equal" && (
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
          </fieldset>
        )}
        {state?.ok === false && <p className="text-sm text-destructive">{state.error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button type="submit" disabled={pending || previewing}>
            {pending ? "Adding…" : "Add column"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/** A Select whose value is submitted with the form under `id` as its name. */
function SelectField({
  id,
  items,
  defaultValue,
}: {
  id: string;
  items: { value: string; label: string }[];
  defaultValue: string;
}) {
  return (
    <Select name={id} items={items} defaultValue={defaultValue}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ModeChoice({
  value,
  onChange,
  equalHint,
  manualHint,
}: {
  value: "equal" | "manual";
  onChange: (value: "equal" | "manual") => void;
  equalHint: string;
  manualHint: string;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Split</legend>
      <div className="flex gap-4 text-sm">
        {(["equal", "manual"] as const).map((mode) => (
          <label key={mode} className="flex items-center gap-2">
            <input
              type="radio"
              name="splitMode"
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
              className="accent-amber-600"
            />
            {mode === "equal" ? "Auto equal" : "Manual"}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{value === "equal" ? equalHint : manualHint}</p>
    </fieldset>
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
