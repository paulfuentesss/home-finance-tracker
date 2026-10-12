-- A login that only looks (docs/decisions.md, 2026-10-12). Additive and safe for the code
-- already deployed. Add a view-only member only once this code is live: localhost shares the
-- database, and older code treats any non-admin as a housemate ("Start next month" would put
-- them in the month).
ALTER TYPE "public"."member_role" ADD VALUE 'view_only';