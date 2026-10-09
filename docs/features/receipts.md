# Receipts

## Status
✅ Working: the admin attaches proof to bills and payments. Housemates sending their own payment with
proof is next ([TODO.md](../TODO.md)).

## What it does
- **Payment Proofs / Receipts tab** (tab 3): every bill of the month as a card, and every
  payment recorded on Settle Up as a row, each with its proof — screenshots of bank transfers
  and bill payments. Images only: a phone screenshot is enough proof, so PDFs (e.g. e-bills)
  aren't accepted.
- **Attach proof** (PA, open month): pick one or more screenshots. Each bill or payment holds a
  few (`MAX_RECEIPTS_PER_ITEM` in `lib/receipts.ts`), so a mis-tap can't attach a whole camera
  roll; at the limit, Attach is replaced by a note to delete one first. On a phone the picker
  offers Photos and Files; there's no forced camera.
- Tap a proof to see it full size, open the original in a new tab, or (PA, open month) delete it.
- Everyone signed in can see every proof, like the rest of the month.
- Receipts never change the math.

## How it's built
- Route: `app/periods/[year]/[month]/receipts/page.tsx`; UI: `components/receipts.tsx`
  (`ReceiptsCard` for bills, `ReceiptsRow` for payments, the viewer dialog).
- **Files** live in the **private** Supabase Storage bucket `receipts`
  (`npm run storage:setup` creates it: private, with the size limit `MAX_RECEIPT_BYTES` and only
  the `RECEIPT_TYPES` images from `lib/receipts.ts`), named `YYYY/MM/<random id>.<ext>`.
- **Table** `receipts`: one row per file, belonging to exactly one bill or payment
  (`receipts_one_owner`), plus who uploaded it. Rows go when their bill or payment is deleted.
- **Before upload, in the browser** (`lib/receipt-image.ts`): images are redrawn as JPEG,
  capped in width but not in height so long screenshots stay readable
  (`fitReceiptSize`). A phone screenshot of a few MB becomes a few hundred KB, and photo
  details such as location (EXIF) are dropped.
- **Upload** (`uploadReceipt` in `actions.ts`, `run("admin", …)`): the server checks the file's
  real type from its first bytes and its size (`checkReceiptFile` in `lib/receipts.ts`), then
  checks the bill or payment is in an open month and below the per-item limit (again when saving,
  with the row locked, so two uploads at once can't both be the last one). It uploads the file,
  then saves the row (and removes the file again if that fails). Server Action bodies are
  capped by `bodySizeLimit` in `next.config.ts`.
- **Viewing** goes through `app/receipts/[id]/route.ts`, which checks the login and redirects to
  a link to the file that works for one minute. The page links there, so links never go stale.
  The images are plain `<img>`s: `next/image` would copy private files into its disk cache.
- **Deleting** a receipt, a bill or a payment removes the rows first, then the files once that
  has committed (best effort: a leftover file is invisible and only takes space).
- Uses the server-only secret key through `receiptStorage()` in `lib/supabase/admin-server.ts`;
  the publishable key can't see the bucket.
- Backups: `npm run storage:backup` copies the files ([operations.md](../operations.md#backups)).

## Rules
[Receipts](../settlement-rules.md#receipts)

## Open items
In [TODO.md](../TODO.md): housemates sending a payment with proof; proof for advances.

## Built in
`feat/receipts`.
