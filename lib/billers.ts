// Loads the Billers tab (docs/features/billers.md). Lines the page's viewer may not see are left
// out here, on the server — hiding them in the browser wouldn't keep them private. A password
// comes back only as "is one saved"; its value is fetched on Reveal (app/biller-secrets/[id]).

import "server-only";
import { asc, sql } from "drizzle-orm";
import { billerFields, billers, db } from "@/db";
import { getPreview, requireViewer } from "@/lib/auth";
import { canSeeBillerField, isAdmin } from "@/lib/permissions";

export type BillerFieldKind = "text" | "link" | "secret" | "heading";

export interface ViewBillerField {
  id: number;
  kind: BillerFieldKind;
  label: string;
  /** Text and links only; null for a heading or a password. */
  value: string | null;
  /** Passwords only: whether one is saved. */
  hasSecret: boolean;
  housematesCanSee: boolean;
}

export interface ViewBiller {
  id: number;
  name: string;
  fields: ViewBillerField[];
}

/** Every biller with the lines the page's viewer may see, in order. */
export async function getBillers(): Promise<ViewBiller[]> {
  const viewer = await requireViewer();
  // Filtered for whoever the page is drawn for, so a preview shows what that housemate sees.
  // (The /biller-secrets/<id> route checks the real viewer.)
  const drawnFor = (await getPreview()) ?? viewer;
  const [billerRows, fieldRows] = await Promise.all([
    db.select({ id: billers.id, name: billers.name }).from(billers).orderBy(asc(billers.sortOrder), asc(billers.id)),
    db
      .select({
        id: billerFields.id,
        billerId: billerFields.billerId,
        kind: billerFields.kind,
        label: billerFields.label,
        value: billerFields.value,
        // Never the encrypted value itself.
        hasSecret: sql<boolean>`${billerFields.secretValue} is not null`,
        housematesCanSee: billerFields.housematesCanSee,
      })
      .from(billerFields)
      .orderBy(asc(billerFields.sortOrder), asc(billerFields.id)),
  ]);
  const admin = isAdmin(drawnFor);
  return billerRows
    .map((b) => ({
      id: b.id,
      name: b.name,
      fields: fieldRows
        .filter((f) => f.billerId === b.id && canSeeBillerField(drawnFor, f))
        .map((f) => ({
          id: f.id,
          kind: f.kind,
          label: f.label,
          value: f.value,
          hasSecret: f.hasSecret,
          housematesCanSee: f.housematesCanSee,
        })),
    }))
    // A housemate doesn't see a biller with nothing shared; the admin sees empty ones to fill in.
    .filter((b) => admin || b.fields.length > 0);
}
