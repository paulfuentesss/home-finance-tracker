"use client";

import { removeMember, updateMemberEmail } from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { AddMemberDialog } from "@/components/entry-dialogs";
import { InlineInput } from "@/components/inline-input";
import { cn } from "@/lib/utils";

interface Member {
  id: number;
  name: string;
  isCollector: boolean;
  dotClass: string;
  /** The invited login email, or null. */
  email: string | null;
  /** Whether a Supabase login exists for them (set when invited). */
  linked: boolean;
}

export function ManageMembers({ members, viewerId }: { members: Member[]; viewerId: number }) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Manage Housemates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add or remove people who share the house costs. A <strong>login email</strong> lets someone sign in —
            with Google, or with a code sent to that email. For Google, use the exact address Google shows (dots
            included). Clear it to take their login away.
          </p>
        </div>
        <AddMemberDialog />
      </div>
      <ul className="mt-4 space-y-2">
        {members.map((m) => (
          <li key={m.id} className="rounded-lg border bg-zinc-50/60 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5 font-medium">
                <span className={cn("size-2.5 rounded-full", m.dotClass)} aria-hidden />
                {m.name}
                {m.isCollector && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-600">collector</span>
                )}
                {m.linked && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-normal text-emerald-700">
                    can log in
                  </span>
                )}
              </span>
              {!m.isCollector && (
                <ConfirmDeleteButton
                  label={`Remove ${m.name}`}
                  title={`Remove ${m.name} from the household?`}
                  description={
                    <>
                      {m.name} won&apos;t be included in future months, and their login is taken away. Months where{" "}
                      {m.name} has advances, payments, paid bills or typed Manual amounts keep them so those numbers
                      don&apos;t change; otherwise they&apos;re taken out of open months and the bills re-split (a ₱0
                      bill they&apos;re down as paying goes to the collector). Their history is kept, and adding the
                      same name again brings them back (invite them again to log in).
                    </>
                  }
                  confirmLabel="Remove"
                  onConfirm={() => removeMember(m.id)}
                />
              )}
            </div>
            <div className="mt-2 text-sm">
              {m.id === viewerId ? (
                // Your own login is changed with `npm run auth:invite`, so a typo can't lock you out.
                <p className="text-muted-foreground">
                  Login: <span className="font-medium text-foreground">{m.email ?? "not set"}</span> (you)
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  Login email
                  <InlineInput
                    action={updateMemberEmail}
                    hidden={{ memberId: m.id }}
                    name="email"
                    value={m.email ?? ""}
                    label={`${m.name}'s login email`}
                    inputMode="email"
                    maxLength={254}
                    inputClassName="w-64 px-2 py-1 text-sm text-foreground"
                  />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
