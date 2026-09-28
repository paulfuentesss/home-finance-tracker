"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { ActionState } from "@/app/periods/[year]/[month]/actions";
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

/**
 * A trash button that asks for confirmation, then runs a Server Action and shows its error.
 * Without `onConfirm` it only explains why the thing can't be deleted yet.
 */
export function ConfirmDeleteButton({
  label,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: {
  label: string;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onConfirm?: () => Promise<ActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={label} className="text-muted-foreground hover:text-destructive" />
        }
      >
        <Trash2 />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{onConfirm ? "Cancel" : "OK"}</DialogClose>
          {onConfirm && (
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await onConfirm();
                  if (result?.ok) setOpen(false);
                  else if (result) setError(result.error);
                })
              }
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
