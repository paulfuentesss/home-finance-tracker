# Receipts

## Status
🚧 Partly built: the Receipts tab is laid out; uploads aren't built.

## What it does (planned)
- Attach a screenshot of a payment or receipt (payment app, bank transfer) to a bill, an
  advance or a payment, as proof.
- See the month's proofs in one place. Receipts never change the math.

## How it's built
- Route: `app/periods/[year]/[month]/receipts/page.tsx` (tab 3) — layout only.
- Schema already has `receipt_path` on `bill_items` and `advances`.
- Planned: a **private** Supabase Storage bucket and upload flow, served through the app so
  the same login checks apply ([auth.md](auth.md)). Storage policies must never grant access
  to every `authenticated` user.

## Rules
[Receipts](../settlement-rules.md#receipts)

## Open items
Receipt uploads ([TODO.md](../TODO.md)).

## Built in
Tab layout in the early 4-tab redesign on `main`.
