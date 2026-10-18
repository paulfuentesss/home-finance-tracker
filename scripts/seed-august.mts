// Loads the made-up August 2026 (lib/__fixtures__/august-2026.ts) as test data, adding its
// members (Ana, Ben, Cara, Dan, PA) if they're missing.
//
//   npm run db:seed:august              # load it if August 2026 doesn't exist yet
//   npm run db:seed:august -- --replace # delete August 2026 and load it fresh (resets test data)
//
// Local database only (refuses the live one — lib/local-database.ts). Only ever touches the
// 2026-08 period (and, with --replace, its receipt files).

import { and, eq, inArray, or } from "drizzle-orm";
import { createDb } from "../db/client";
import {
  advances,
  billEmails,
  billingPeriods,
  billItems,
  billItemShares,
  helperEntries,
  payments,
  periodBalances,
  receipts,
  sharedColumns,
} from "../db/schema";
import { AUGUST_2026 } from "../lib/__fixtures__/august-2026";
import { loadAugust } from "../lib/__fixtures__/load-august";
import { refuseLiveDatabase } from "../lib/local-database";
import { RECEIPTS_BUCKET } from "../lib/receipts";
import { createAdminClient } from "../lib/supabase/admin";

const url = process.env.DIRECT_URL;
if (!url) throw new Error("DIRECT_URL is not set — fill in .env.local first.");
refuseLiveDatabase(url, "npm run db:seed:august");
const replace = process.argv.includes("--replace");

const { db, client } = createDb(url, { max: 1 });
// Files of receipts deleted with the old August, removed from Storage once the reset commits.
let receiptFiles: string[] = [];

try {
  await db.transaction(async (tx) => {
    const existing = await tx.query.billingPeriods.findFirst({
      where: and(eq(billingPeriods.year, AUGUST_2026.year), eq(billingPeriods.month, AUGUST_2026.month)),
    });
    if (existing && !replace) {
      console.log("August 2026 already exists — nothing to do. (Use -- --replace to reset it.)");
      return;
    }
    if (existing) {
      // Child rows first: the foreign keys are ON DELETE RESTRICT to protect history.
      const billIds = (await tx.select({ id: billItems.id }).from(billItems).where(eq(billItems.periodId, existing.id))).map((b) => b.id);
      // Receipt rows go with their bill or payment (ON DELETE CASCADE); keep the file names.
      receiptFiles = (
        await tx
          .select({ path: receipts.storagePath })
          .from(receipts)
          .leftJoin(billItems, eq(billItems.id, receipts.billItemId))
          .leftJoin(payments, eq(payments.id, receipts.paymentId))
          .where(or(eq(billItems.periodId, existing.id), eq(payments.periodId, existing.id)))
      ).map((r) => r.path);
      await tx.delete(advances).where(eq(advances.periodId, existing.id));
      await tx.delete(helperEntries).where(eq(helperEntries.periodId, existing.id));
      // shared_column_members rows go with their column (ON DELETE CASCADE).
      await tx.delete(sharedColumns).where(eq(sharedColumns.periodId, existing.id));
      if (billIds.length) await tx.delete(billItemShares).where(inArray(billItemShares.billItemId, billIds));
      await tx.delete(billItems).where(eq(billItems.periodId, existing.id));
      await tx.delete(payments).where(eq(payments.periodId, existing.id));
      await tx.delete(periodBalances).where(eq(periodBalances.periodId, existing.id));
      await tx.delete(billingPeriods).where(eq(billingPeriods.id, existing.id));
      // Its bill emails too, so the sample emails can be imported again (npm run bills:import).
      await tx
        .delete(billEmails)
        .where(and(eq(billEmails.billYear, AUGUST_2026.year), eq(billEmails.billMonth, AUGUST_2026.month)));
      console.log("Deleted the existing August 2026.");
    }

    // Shared with the database tests (lib/__fixtures__/load-august.ts).
    await loadAugust(tx);
    console.log(`Loaded August 2026: ${AUGUST_2026.bills.length} bills, ${AUGUST_2026.advances.length} advances.`);
  });
  if (receiptFiles.length) await removeReceiptFiles(receiptFiles);
} finally {
  await client.end();
}

async function removeReceiptFiles(paths: string[]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const { error } =
    supabaseUrl && secretKey
      ? await createAdminClient(supabaseUrl, secretKey).storage.from(RECEIPTS_BUCKET).remove(paths)
      : { error: { message: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY isn't set" } };
  if (error) console.warn(`Couldn't remove ${paths.length} old receipt file(s) from Storage: ${error.message}`);
  else console.log(`Removed ${paths.length} old receipt file(s) from Storage.`);
}
