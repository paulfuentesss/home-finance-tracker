import { ArrowRight } from "lucide-react";
import type { ViewMember } from "@/lib/periods";
import { cn } from "@/lib/utils";

/** "● PJ → ● PA": who pays whom, with each member's color dot (Settle Up and Receipts). */
export function Pair({ from, to }: { from: ViewMember; to: ViewMember }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium">
      <Dot member={from} />
      {from.name}
      <ArrowRight className="size-3.5 text-muted-foreground" aria-label="pays" />
      <Dot member={to} />
      {to.name}
    </span>
  );
}

function Dot({ member }: { member: ViewMember }) {
  return <span className={cn("size-2 rounded-full", member.dotClass)} aria-hidden />;
}
