import { formatPHP, type Centavos } from "@/lib/money";
import { cn } from "@/lib/utils";

/** A Final balance: red "To pay", green "To receive", or grey "Settled" at ₱0.00. */
export function Balance({ amount }: { amount: Centavos }) {
  if (amount === 0) return <span className="text-zinc-500">₱0.00 <span className="font-sans text-[11px]">Settled</span></span>;
  const owes = amount > 0;
  return (
    <span className={cn("font-semibold", owes ? "text-rose-600" : "text-emerald-600")}>
      {formatPHP(Math.abs(amount))}
      <span className="ml-1 font-sans text-[11px] font-normal">{owes ? "To pay" : "To receive"}</span>
    </span>
  );
}
