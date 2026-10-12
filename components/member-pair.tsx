import { ArrowRight, Landmark } from "lucide-react";
import { MemberMark } from "@/components/member-mark";
import { HOUSE_BUDGET_LABEL } from "@/lib/household-config";
import type { ViewMember } from "@/lib/periods";
import { HOUSE_BUDGET, type Party } from "@/lib/settlement";

/** One side of a payment, ready to show: a member, or the House Budget. */
export type PartyView = { kind: "member"; member: ViewMember } | { kind: "house-budget" };

/** A payment side → what to show; undefined for a member who isn't in the month. */
export function partyView(party: Party, memberOf: ReadonlyMap<number, ViewMember>): PartyView | undefined {
  if (party === HOUSE_BUDGET) return { kind: "house-budget" };
  const member = memberOf.get(party);
  return member && { kind: "member", member };
}

/** A payment side's name, for labels and confirmations. */
export function partyName(party: Party, memberOf: ReadonlyMap<number, ViewMember>, fallback = "someone"): string {
  return party === HOUSE_BUDGET ? HOUSE_BUDGET_LABEL : (memberOf.get(party)?.name ?? fallback);
}

/** "● Ana → 🏛 House Budget": who pays whom, with each member's emoji or colour dot (Settle Up and Receipts). */
export function Pair({ from, to }: { from: PartyView; to: PartyView }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium">
      <Side party={from} />
      <ArrowRight className="size-3.5 text-muted-foreground" aria-label="pays" />
      <Side party={to} />
    </span>
  );
}

function Side({ party }: { party: PartyView }) {
  if (party.kind === "house-budget") {
    return (
      <>
        <Landmark className="size-3.5 text-zinc-500" aria-hidden />
        {HOUSE_BUDGET_LABEL}
      </>
    );
  }
  return (
    <>
      <MemberMark dotClass={party.member.dotClass} emoji={party.member.emoji} className="size-5 text-sm" />
      {party.member.name}
    </>
  );
}
