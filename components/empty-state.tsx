import { cn } from "@/lib/utils";

/**
 * What a list or table shows while it has nothing in it ("No advances logged this month yet."),
 * the same on every tab: a dashed box with muted, centred text. `as="li"` inside a <ul>; inside a
 * table, put it in a full-width cell.
 */
export function EmptyState({
  as: Tag = "p",
  className,
  children,
}: {
  as?: "p" | "li" | "div";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag className={cn("rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground", className)}>
      {children}
    </Tag>
  );
}
