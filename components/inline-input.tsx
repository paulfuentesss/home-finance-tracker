"use client";

import { Check } from "lucide-react";
import { startTransition, useActionState, useId } from "react";
import type { ActionState } from "@/app/periods/[year]/[month]/actions";
import { cn } from "@/lib/utils";

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A field edited in place (amounts in the Split Table, Meralco points, column names). Every
 * editable value in a table or list uses this so they all behave the same:
 *
 * - Saves on Enter or when it loses focus, only if the value changed.
 * - Escape puts the saved value back without saving.
 * - While saving the field is readOnly, not disabled: disabling a focused input blurs it, and
 *   the blur would submit again with the field missing from the FormData.
 * - Submits through onSubmit rather than <form action>: React resets a form after every
 *   `action`, even a failed one, which would wipe a mistyped value next to its error.
 * - A small "Saved" check fades out after each successful save.
 *
 * The field shows `value` until the server sends a new one (the input is keyed on it).
 */
export function InlineInput({
  action,
  hidden,
  name,
  value,
  label,
  prefix,
  suffix,
  inputMode,
  maxLength,
  allowEmpty = true,
  className,
  inputClassName,
}: {
  action: FormAction;
  /** Extra fields sent with the value, e.g. { billId, memberId }. */
  hidden: Record<string, number>;
  name: string;
  value: string;
  label: string;
  prefix?: string;
  suffix?: string;
  inputMode?: "decimal" | "text" | "email";
  maxLength?: number;
  /** false: an emptied field (e.g. a name) is put back instead of saved. */
  allowEmpty?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const errorId = useId();
  // `saves` counts successful saves so the "Saved" check replays its fade-out each time.
  const [state, dispatch, pending] = useActionState<{ result: ActionState; saves: number }, FormData>(
    async (prev, formData) => {
      const result = await action(prev.result, formData);
      return { result, saves: prev.saves + (result?.ok ? 1 : 0) };
    },
    { result: null, saves: 0 },
  );
  const error = state.result?.ok === false ? state.result.error : null;

  return (
    <form
      className={cn("inline-block", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => dispatch(formData));
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <span className="relative inline-flex items-center gap-1">
        {prefix && <span className="pointer-events-none absolute left-2 text-xs text-muted-foreground">{prefix}</span>}
        <input
          key={value}
          name={name}
          defaultValue={value}
          inputMode={inputMode}
          maxLength={maxLength}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          readOnly={pending}
          className={cn(
            "rounded-md border border-input bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none read-only:opacity-50 aria-invalid:border-rose-500",
            prefix && "pl-5",
            inputClassName,
          )}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.currentTarget.value = value;
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            const next = e.currentTarget.value.trim();
            if (pending || next === value) return;
            if (!next && !allowEmpty) {
              e.currentTarget.value = value;
              return;
            }
            e.currentTarget.form?.requestSubmit();
          }}
        />
        {suffix && <span className="text-muted-foreground">{suffix}</span>}
        {state.saves > 0 && !error && (
          <Check
            key={state.saves}
            aria-label="Saved"
            className="absolute -right-5 size-3.5 animate-out fill-mode-forwards text-emerald-600 duration-500 fade-out delay-1000"
          />
        )}
      </span>
      {error && (
        <p id={errorId} className="mx-auto mt-1 max-w-40 font-sans text-[11px] whitespace-normal text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
