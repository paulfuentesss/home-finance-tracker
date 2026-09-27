"use client";

import { removeMember } from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { AddMemberDialog } from "@/components/entry-dialogs";
import { cn } from "@/lib/utils";

interface Member {
  id: number;
  name: string;
  isCollector: boolean;
  dotClass: string;
}

export function ManageMembers({ members }: { members: Member[] }) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Manage Housemates</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add or remove people who share the house costs.</p>
        </div>
        <AddMemberDialog />
      </div>
      <ul className="mt-4 space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border bg-zinc-50/60 px-4 py-3">
            <span className="flex items-center gap-2.5 font-medium">
              <span className={cn("size-2.5 rounded-full", m.dotClass)} aria-hidden />
              {m.name}
              {m.isCollector && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-600">collector</span>
              )}
            </span>
            {!m.isCollector && (
              <ConfirmDeleteButton
                label={`Remove ${m.name}`}
                title={`Remove ${m.name} from the household?`}
                description={
                  <>
                    {m.name} won&apos;t be included in future months. Months where {m.name} has advances, payments or
                    paid bills keep them so those numbers don&apos;t change; otherwise they&apos;re taken out of open
                    months and the bills re-split. Their history is kept, and adding the same name again brings them
                    back.
                  </>
                }
                confirmLabel="Remove"
                onConfirm={() => removeMember(m.id)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
