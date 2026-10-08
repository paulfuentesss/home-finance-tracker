"use client";

import { ExternalLink, ImageOff, Paperclip } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { deleteReceipt, uploadReceipt } from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCanEdit } from "@/components/viewer-context";
import type { ViewReceipt } from "@/lib/periods";
import { prepareReceiptFile } from "@/lib/receipt-image";
import { MAX_RECEIPT_BYTES, MAX_RECEIPTS_PER_ITEM, receiptsLeft } from "@/lib/receipts";

// Proof attached to a bill or a payment (docs/features/receipts.md). Files are opened through
// /receipts/<id>, which checks the login before handing out a short-lived link to the file.

interface Props {
  owner: { type: "bill" | "payment"; id: number };
  receipts: ViewReceipt[];
  status: "open" | "closed";
  /** What the proof is for, e.g. "Meralco" — used in alt text and the viewer's title. */
  label: string;
}

const receiptUrl = (id: number) => `/receipts/${id}`;

/** A bill's card: the first proof large on top, the rest as small thumbnails below. */
export function ReceiptsCard({ badge, children, ...props }: Props & { badge?: React.ReactNode; children: React.ReactNode }) {
  const { receipts, label } = props;
  const upload = useReceiptUpload(props);
  const [viewing, setViewing] = useState<ViewReceipt | null>(null);
  const [first, ...rest] = receipts;

  return (
    <article className="overflow-hidden rounded-xl border bg-white shadow-xs">
      <div className="relative aspect-[16/9] bg-zinc-100">
        {first ? (
          <button
            type="button"
            onClick={() => setViewing(first)}
            className="block size-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ReceiptThumb receipt={first} label={label} className="size-full object-cover object-top" />
          </button>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-zinc-400">
            <ImageOff className="size-8" />
            <span className="text-sm">No proof attached yet</span>
          </div>
        )}
        {badge && <div className="absolute top-3 right-3">{badge}</div>}
      </div>
      <div className="space-y-3 p-4">
        {children}
        {rest.length > 0 && <ThumbRow receipts={rest} label={label} onOpen={setViewing} />}
        {upload.control}
      </div>
      <ReceiptViewer receipt={viewing} label={label} status={props.status} onClose={() => setViewing(null)} />
    </article>
  );
}

/** A payment's row: details on the left, proof thumbnails and Attach on the right. */
export function ReceiptsRow({ children, ...props }: Props & { children: React.ReactNode }) {
  const upload = useReceiptUpload(props);
  const [viewing, setViewing] = useState<ViewReceipt | null>(null);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">{children}</div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ThumbRow receipts={props.receipts} label={props.label} onOpen={setViewing} />
        {upload.control}
      </div>
      <ReceiptViewer receipt={viewing} label={props.label} status={props.status} onClose={() => setViewing(null)} />
    </li>
  );
}

function ThumbRow({
  receipts,
  label,
  onOpen,
}: {
  receipts: ViewReceipt[];
  label: string;
  onOpen: (r: ViewReceipt) => void;
}) {
  if (receipts.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {receipts.map((r, i) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onOpen(r)}
            aria-label={`Open proof ${i + 1} for ${label}`}
            className="block size-12 overflow-hidden rounded-md border bg-zinc-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ReceiptThumb receipt={r} label={label} className="size-full object-cover object-top" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ReceiptThumb({ receipt, label, className }: { receipt: ViewReceipt; label: string; className?: string }) {
  return (
    // A plain <img>: next/image would copy these private files into its own cache on disk,
    // and the link behind /receipts/<id> changes every minute anyway.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={receiptUrl(receipt.id)} alt={`Proof of payment for ${label}`} loading="lazy" className={className} />
  );
}

/** The Attach button (PA, open month): picks files, shrinks images, uploads them one by one. */
function useReceiptUpload({ owner, receipts, status, label }: Props) {
  const canEdit = useCanEdit(status);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const left = receiptsLeft(receipts.length);

  const onFiles = (files: File[]) => {
    setError(null);
    if (files.length > left) {
      setError(
        `Up to ${MAX_RECEIPTS_PER_ITEM} proofs each: you can add ${left} more. Nothing was attached.`,
      );
      return;
    }
    startTransition(async () => {
      for (const [i, original] of files.entries()) {
        setProgress(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : "Uploading…");
        const file = await prepareReceiptFile(original);
        if (file.size > MAX_RECEIPT_BYTES) {
          setError(`${original.name} is too large (the limit is ${MAX_RECEIPT_BYTES / 1024 / 1024} MB).`);
          break;
        }
        const formData = new FormData();
        formData.set("ownerType", owner.type);
        formData.set("ownerId", String(owner.id));
        formData.set("file", file);
        const result = await uploadReceipt(null, formData);
        if (!result?.ok) {
          setError(result?.error ?? "Couldn't upload that file. Please try again.");
          break;
        }
      }
      setProgress(null);
    });
  };

  const control = canEdit ? (
    <div className="space-y-1">
      <input
        ref={input}
        type="file"
        // No `capture`: that would force the camera, and most proofs are screenshots.
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.currentTarget.files ?? [])];
          e.currentTarget.value = "";
          if (files.length) onFiles(files);
        }}
      />
      {left > 0 || pending ? (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
          <Paperclip />
          {pending ? (progress ?? "Uploading…") : "Attach proof"}
          <span className="sr-only"> for {label}</span>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          {MAX_RECEIPTS_PER_ITEM} proofs attached, the most. Delete one to add another.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  ) : null;

  return { control };
}

/** The proof full size, with a link to the original and (PA, open month) Delete. */
function ReceiptViewer({
  receipt,
  label,
  status,
  onClose,
}: {
  receipt: ViewReceipt | null;
  label: string;
  status: "open" | "closed";
  onClose: () => void;
}) {
  const canEdit = useCanEdit(status);
  return (
    <Dialog open={receipt !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {receipt && (
          <>
            <DialogHeader>
              <DialogTitle>Proof for {label}</DialogTitle>
              <DialogDescription>{receipt.originalName ?? "Screenshot"}</DialogDescription>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element -- see ReceiptThumb */}
            <img
              src={receiptUrl(receipt.id)}
              alt={`Proof of payment for ${label}`}
              className="max-h-[70vh] w-full rounded-lg bg-zinc-100 object-contain"
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                render={<a href={receiptUrl(receipt.id)} target="_blank" rel="noopener noreferrer" />}
                nativeButton={false}
              >
                <ExternalLink />
                Open original
              </Button>
              {canEdit && (
                <ConfirmDeleteButton
                  label={`Delete this proof for ${label}`}
                  title="Delete this proof?"
                  description={`The file is removed for good. ${label} itself doesn't change.`}
                  onConfirm={async () => {
                    const result = await deleteReceipt(receipt.id);
                    if (result?.ok) onClose();
                    return result;
                  }}
                />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
