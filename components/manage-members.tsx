"use client";

import {
  removeMember,
  updateHouseBudgetEmoji,
  updateMemberEmail,
  updateMemberEmoji,
} from "@/app/periods/[year]/[month]/actions";
import { ConfirmDeleteButton } from "@/components/confirm-button";
import { AddMemberDialog } from "@/components/entry-dialogs";
import { InlineInput } from "@/components/inline-input";
import { HouseBudgetMark, MemberMark } from "@/components/member-mark";
import { HOUSE_BUDGET_LABEL } from "@/lib/household-config";
import { MAX_EMOJI_LENGTH } from "@/lib/members";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

interface Member {
  id: number;
  name: string;
  isCollector: boolean;
  /** A view-only login: joins no month, shares in nothing. */
  viewOnly: boolean;
  dotClass: string;
  /** Their emoji (shown in place of the dot), or null. */
  emoji: string | null;
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

export function ManageMembers({
  members,
  viewerId,
  houseBudgetEmoji,
}: {
  members: Member[];
  viewerId: number;
  /** The House Budget's emoji, or null for its icon. */
  houseBudgetEmoji: string | null;
}) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Manage Housemates</h2>
          <p className="mt-1 text-sm text-muted-foreground">Who shares the house costs, and who can log in.</p>
        </div>
        <AddMemberDialog className="w-full sm:w-auto" />
      </div>
      {/* The terms used on each row, folded away so the list stays the first thing you see. */}
      <details className="group mt-3 text-sm text-muted-foreground">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 font-medium text-foreground/80 hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
          What the labels mean
        </summary>
        <dl className="mt-2 space-y-1.5 border-l pl-4">
          <div>
            <dt className="inline font-medium text-foreground">View only</dt>
            <dd className="inline"> — sees what housemates see, changes nothing, shares in nothing.</dd>
          </div>
          <div>
            <dt className="inline font-medium text-foreground">Login email</dt>
            <dd className="inline">
              {" "}
              — they sign in with Google or a code sent to that email. For Google, use the exact address Google shows
              (dots included). Clear it to take their login away.
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-foreground">Last seen</dt>
            <dd className="inline">
              {" "}
              — when they last opened My House, in the app or a browser. Counted from when this was added, so someone
              shows &ldquo;Not seen yet&rdquo; until their next visit.
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-foreground">App installed</dt>
            <dd className="inline"> — they&apos;ve opened the installed app at least once.</dd>
          </div>
        </dl>
      </details>
      <ul className="mt-4 space-y-2">
        {members.map((m) => (
          <FoldRow
            key={m.id}
            title={
              <span className="flex flex-wrap items-center gap-2.5 font-medium">
                <MemberMark dotClass={m.dotClass} emoji={m.emoji} className="size-8 text-2xl" />
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
            }
            actions={
              !m.isCollector && (
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
              )
            }
          >
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
              <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                Emoji
                <InlineInput
                  action={updateMemberEmoji}
                  hidden={{ memberId: m.id }}
                  name="emoji"
                  value={m.emoji ?? ""}
                  label={`${m.name}'s emoji`}
                  maxLength={MAX_EMOJI_LENGTH}
                  inputClassName="w-14 px-2 py-1 text-center text-base"
                />
                <span className="text-xs">One emoji; empty for the colour dot.</span>
              </div>
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
          </FoldRow>
        ))}
        {/* Not a housemate, but it shows beside the names the same way (updateHouseBudgetEmoji). */}
        <FoldRow
          title={
            <span className="flex items-center gap-2.5 font-medium">
              <HouseBudgetMark emoji={houseBudgetEmoji} className="size-8 text-2xl" />
              {HOUSE_BUDGET_LABEL}
            </span>
          }
        >
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Emoji
            <InlineInput
              action={updateHouseBudgetEmoji}
              hidden={{}}
              name="emoji"
              value={houseBudgetEmoji ?? ""}
              label={`${HOUSE_BUDGET_LABEL}'s emoji`}
              maxLength={MAX_EMOJI_LENGTH}
              inputClassName="w-14 px-2 py-1 text-center text-base"
            />
            <span className="text-xs">One emoji; empty for the bank icon.</span>
          </div>
        </FoldRow>
      </ul>
    </section>
  );
}

/**
 * One row of the list. On a phone it starts closed, showing only `title` (and `actions`);
 * tapping the title opens the rest. From lg up it's always open — the same fold as the
 * Billers cards (components/billers.tsx).
 */
function FoldRow({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <li className="rounded-lg border bg-zinc-50/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="flex flex-1 items-center justify-between gap-2 text-left lg:pointer-events-none"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
        >
          {title}
          <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform lg:hidden", open && "rotate-180")} />
        </button>
        {actions}
      </div>
      <div id={bodyId} className={cn(!open && "hidden", "lg:block")}>
        {children}
      </div>
    </li>
  );
}
