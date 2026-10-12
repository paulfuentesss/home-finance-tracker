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
  /** A view-only login: joins no month, shares in nothing. */
  viewOnly: boolean;
  dotClass: string;
  /** The invited login email, or null. */
  email: string | null;
  /** Whether a Supabase login exists for them (set when invited). */
  linked: boolean;
  /** When they last used My House and from where (lib/devices.ts); null before their first visit. */
  activity: MemberActivityView | null;
}

/** Ready-made text, worked out on the server (app/periods/[year]/[month]/manage/page.tsx). */
export interface MemberActivityView {
  /** They've opened the installed app at least once. */
  installed: boolean;
  /** "3 h ago · App on iPhone". */
  lastSeen: string;
  /** Their other devices: "Web on Mac (2 days ago)". */
  others: string[];
}

export function ManageMembers({ members, viewerId }: { members: Member[]; viewerId: number }) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Manage Housemates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add or remove people who share the house costs, or who only look (<strong>view only</strong>: they see what
            housemates see, change nothing and share in nothing). A <strong>login email</strong> lets someone sign in —
            with Google, or with a code sent to that email. For Google, use the exact address Google shows (dots
            included). Clear it to take their login away.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <strong>Last seen</strong> is when they last opened My House, in the installed app or a browser.{" "}
            <strong>App installed</strong> means they&apos;ve opened the app at least once. Both count from when this
            was added, so someone shows &ldquo;Not seen yet&rdquo; until their next visit.
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
                {m.viewOnly && (
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-normal text-sky-700">view only</span>
                )}
                {m.linked && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-normal text-emerald-700">
                    can log in
                  </span>
                )}
                {m.activity?.installed && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-normal text-amber-700">
                    app installed
                  </span>
                )}
              </span>
              {!m.isCollector && (
                <ConfirmDeleteButton
                  label={`Remove ${m.name}`}
                  title={`Remove ${m.name} from the household?`}
                  description={
                    m.viewOnly ? (
                      <>
                        {m.name}&apos;s login is taken away. They share in nothing, so no numbers change. Adding the
                        same name again with View only ticked brings them back (invite them again to log in).
                      </>
                    ) : (
                      <>
                        {m.name} won&apos;t be included in future months, and their login is taken away. Months where{" "}
                        {m.name} has advances, payments, paid bills or typed Manual amounts keep them so those numbers
                        don&apos;t change; otherwise they&apos;re taken out of open months and the bills re-split (a ₱0
                        bill they&apos;re down as paying goes to the collector). Their history is kept, and adding the
                        same name again brings them back (invite them again to log in).
                      </>
                    )
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
                    className="w-full sm:w-auto"
                    inputClassName="w-full px-2 py-1 text-sm text-foreground sm:w-64"
                  />
                </div>
              )}
              {m.linked && (
                <p className="mt-1 text-muted-foreground">
                  {m.activity ? (
                    <>
                      Last seen <span className="text-foreground">{m.activity.lastSeen}</span>
                      {m.activity.others.length > 0 && <> · also {m.activity.others.join(", ")}</>}
                    </>
                  ) : (
                    "Not seen yet"
                  )}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
