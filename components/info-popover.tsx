import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

/**
 * The ⓘ beside a headline figure (the month header's totals, the Helper tab's summary): a short
 * description, then what makes up the figure. Values come formatted, so a caller can sign them.
 */
export function InfoPopover({
  label,
  description,
  lines = [],
  total,
  note,
  ariaLabel = `What's in ${label.toLowerCase()}`,
}: {
  label: string;
  description: string;
  lines?: { key: string | number; label: string; value: string }[];
  total?: string;
  note?: string;
  ariaLabel?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        aria-label={ariaLabel}
        // The after: box is an invisible, larger tap area on touch screens; the icon looks the same.
        className="relative rounded-full opacity-70 transition-opacity outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-3 pointer-coarse:after:content-['']"
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div>
          <PopoverTitle>{label}</PopoverTitle>
          <PopoverDescription className="text-xs">{description}</PopoverDescription>
        </div>
        {(lines.length > 0 || total !== undefined) && (
          <ul className="divide-y text-xs">
            {lines.map((line) => (
              <li key={line.key} className="flex justify-between gap-3 py-1.5">
                <span>{line.label}</span>
                <span className="shrink-0 font-mono whitespace-nowrap tabular-nums">{line.value}</span>
              </li>
            ))}
            {total !== undefined && (
              <li className="flex justify-between gap-3 py-1.5 font-semibold">
                <span>Total</span>
                <span className="shrink-0 font-mono whitespace-nowrap tabular-nums">{total}</span>
              </li>
            )}
          </ul>
        )}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </PopoverContent>
    </Popover>
  );
}
