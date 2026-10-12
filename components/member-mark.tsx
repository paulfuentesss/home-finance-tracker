import { cn } from "@/lib/utils";

/**
 * A member's mark beside their name: their emoji when they have one (docs/features/manage.md →
 * Emoji), otherwise their colour dot. Always the same square box, so rows line up whether or not
 * someone has an emoji. Decorative: the name is always written beside it.
 */
export function MemberMark({
  dotClass,
  emoji,
  className,
}: {
  dotClass: string;
  emoji?: string | null;
  /** The box's size (and the emoji's, with a text size); defaults to size-6 and text-base. */
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex size-6 shrink-0 items-center justify-center text-base leading-none", className)}
      aria-hidden
    >
      {emoji ? emoji : <span className={cn("size-2.5 rounded-full", dotClass)} />}
    </span>
  );
}
