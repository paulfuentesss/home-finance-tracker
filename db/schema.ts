// Database schema for the household settlement tracker.
// Business rules behind these tables live in docs/settlement-rules.md — read that first.
//
// Money columns are numeric(12,2). Drizzle returns them as strings; convert with
// lib/money.ts (toCentavos) before doing any arithmetic. Never use floats for money.

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const advanceCategory = pgEnum("advance_category", ["grocery", "food", "service", "misc"]);
// "closed" = month locked; any unpaid balance carries over to the next month.
export const periodStatus = pgEnum("period_status", ["open", "closed"]);
export const billSource = pgEnum("bill_source", ["manual", "email"]);
// Email-parsed bills land as "pending" and are ignored by settlement until confirmed.
export const billStatus = pgEnum("bill_status", ["confirmed", "pending"]);
export const billProvider = pgEnum("bill_provider", ["meralco", "water", "pldt"]);
// imported = filled a bill column (as pending) · unmatched = needs a look (reason says why) ·
// dismissed = ignored for good.
export const billEmailStatus = pgEnum("bill_email_status", ["imported", "unmatched", "dismissed"]);
// equal = split evenly; points = split by each member's points (Meralco);
// manual = amounts typed per member, and the bill total is their sum.
export const billSplitMode = pgEnum("bill_split_mode", ["equal", "points", "manual"]);
// admin = PA: can change everything. member = sees everything (except Manage) and logs their
// own advances in the default column (lib/permissions.ts).
export const memberRole = pgEnum("member_role", ["admin", "member"]);

// ---------- Shared column helpers ----------

const money = (name: string) => numeric(name, { precision: 12, scale: 2 });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------- Tables ----------

export const members = pgTable(
  "members",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull().unique(),
    sortOrder: integer("sort_order").notNull().default(0),
    // The member who pays the core bills upfront and collects from everyone (PA).
    isCollector: boolean("is_collector").notNull().default(false),
    // Members are deactivated, never deleted, so history stays intact.
    active: boolean("active").notNull().default(true),
    // Login (docs/features/auth.md). `email` is the invited address (lowercase); inviting
    // creates a Supabase Auth user and stores its id in `auth_user_id`, which every request
    // matches on. Both are null for someone who isn't invited. Never send these to the client.
    email: text("email").unique(),
    authUserId: uuid("auth_user_id").unique(),
    role: memberRole("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("members_single_collector").on(t.isCollector).where(sql`${t.isCollector}`),
    check("members_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
).enableRLS();

export const billingPeriods = pgTable(
  "billing_periods",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: periodStatus("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("billing_periods_year_month").on(t.year, t.month),
    check("billing_periods_month_range", sql`${t.month} between 1 and 12`),
  ],
).enableRLS();

export const billItems = pgTable(
  "bill_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    periodId: integer("period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    totalAmount: money("total_amount").notNull(),
    // Who paid the provider. App code defaults this to the collector.
    paidById: integer("paid_by_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    splitMode: billSplitMode("split_mode").notNull().default("equal"),
    dueDate: date("due_date", { mode: "string" }),
    paidOn: date("paid_on", { mode: "string" }),
    source: billSource("source").notNull().default("manual"),
    status: billStatus("status").notNull().default("confirmed"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("bill_items_period_name").on(t.periodId, t.name),
    // ₱0 is allowed: a new month's copied bill columns start empty until the bill arrives.
    check("bill_items_total_nonneg", sql`${t.totalAmount} >= 0`),
  ],
).enableRLS();

export const billItemShares = pgTable(
  "bill_item_shares",
  {
    billItemId: integer("bill_item_id")
      .notNull()
      .references(() => billItems.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    // Points-mode bills only: this member's points (e.g. Meralco 2.5).
    points: numeric("points", { precision: 5, scale: 2 }),
    // Legacy per-member override flag; no longer used by the UI (use split_mode "manual").
    isOverride: boolean("is_override").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.billItemId, t.memberId] }),
    check("bill_item_shares_amount_nonneg", sql`${t.amount} >= 0`),
  ],
).enableRLS();

// A shared-advances column in the month's matrix, e.g. "Advances Shared" (everyone),
// "Advances Shared w/o PA" or "Ice Maker Adj.". Every advance is logged into one column;
// the column's total is the sum of its advances.
//   equal  → split equally among the members marked `included`
//   manual → each member's typed `amount` (may not add up exactly; the UI flags it)
export const sharedColumns = pgTable(
  "shared_columns",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    periodId: integer("period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Only "equal" and "manual" are used for shared columns.
    splitMode: billSplitMode("split_mode").notNull().default("equal"),
    // The month's everyday "Advances Shared" column (carried into new months).
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("shared_columns_period_name").on(t.periodId, t.name),
    uniqueIndex("shared_columns_one_default").on(t.periodId).where(sql`${t.isDefault}`),
  ],
).enableRLS();

export const sharedColumnMembers = pgTable(
  "shared_column_members",
  {
    columnId: integer("column_id")
      .notNull()
      .references(() => sharedColumns.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    // Equal mode: whether this member shares the column.
    included: boolean("included").notNull().default(true),
    // Manual mode: the amount typed for this member.
    amount: money("amount"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.columnId, t.memberId] }),
    check("shared_column_members_amount_nonneg", sql`${t.amount} >= 0`),
  ],
).enableRLS();

export const advances = pgTable(
  "advances",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    periodId: integer("period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "restrict" }),
    // The shared column this advance is split through.
    columnId: integer("column_id")
      .notNull()
      .references(() => sharedColumns.id, { onDelete: "restrict" }),
    payerId: integer("payer_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    category: advanceCategory("category").notNull(),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    // Optional: some sheet entries were logged without a date.
    spentOn: date("spent_on", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("advances_amount_positive", sql`${t.amount} > 0`)],
).enableRLS();

// Real money changing hands to settle up (usually member → collector).
export const payments = pgTable(
  "payments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    periodId: integer("period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "restrict" }),
    fromMemberId: integer("from_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    toMemberId: integer("to_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("payments_amount_positive", sql`${t.amount} > 0`),
    check("payments_distinct_members", sql`${t.fromMemberId} <> ${t.toMemberId}`),
  ],
).enableRLS();

// Every bill email received (docs/settlement-rules.md → "Email-imported bills"): the Bill
// inbox. Only a short snippet of the body is kept — the full email holds account numbers.
export const billEmails = pgTable(
  "bill_emails",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // The Message-ID header: the same email arriving twice (webhook retries) is ignored.
    messageId: text("message_id").notNull().unique(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    fromAddress: text("from_address").notNull(),
    subject: text("subject").notNull(),
    snippet: text("snippet").notNull(),
    // Parsed values; null when the email couldn't be read.
    provider: billProvider("provider"),
    amount: money("amount"),
    // The payment fee added on import (BILL_PAYMENT_FEES at the time) and what it's for.
    fee: money("fee"),
    feeNote: text("fee_note"),
    dueDate: date("due_date", { mode: "string" }),
    periodStart: date("period_start", { mode: "string" }),
    periodEnd: date("period_end", { mode: "string" }),
    // The month the bill belongs to.
    billYear: integer("bill_year"),
    billMonth: integer("bill_month"),
    status: billEmailStatus("status").notNull(),
    // Why it's unmatched, in words for the household.
    reason: text("reason"),
    // The bill column it filled (imported only).
    billItemId: integer("bill_item_id").references(() => billItems.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One live email per provider per month: a reminder or re-forward of the same bill is
    // ignored, but after a Discard (dismissed) a corrected email can come in.
    uniqueIndex("bill_emails_one_per_month")
      .on(t.provider, t.billYear, t.billMonth)
      .where(sql`${t.status} <> 'dismissed'`),
  ],
).enableRLS();

// One row per member per period = that period's membership (equal splits use this list).
// opening_balance carries over from the previous month; closing_balance is snapshotted on close.
export const periodBalances = pgTable(
  "period_balances",
  {
    periodId: integer("period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "restrict" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    openingBalance: money("opening_balance").notNull().default("0"),
    closingBalance: money("closing_balance"),
  },
  (t) => [primaryKey({ columns: [t.periodId, t.memberId] })],
).enableRLS();

// Proof attached to a bill or a payment (docs/features/receipts.md): a screenshot or photo in
// the private "receipts" Storage bucket. Never changes the math. Deleting the bill or payment
// deletes its rows (the app removes the files after the delete commits).
export const receipts = pgTable(
  "receipts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // The object's name in the bucket: YYYY/MM/<uuid>.<ext> (lib/receipts.ts).
    storagePath: text("storage_path").notNull().unique(),
    // Checked from the file's first bytes on upload, not taken from the browser.
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    originalName: text("original_name"),
    // Exactly one of these is set (the check below).
    billItemId: integer("bill_item_id").references(() => billItems.id, { onDelete: "cascade" }),
    paymentId: integer("payment_id").references(() => payments.id, { onDelete: "cascade" }),
    uploadedById: integer("uploaded_by_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    check("receipts_one_owner", sql`num_nonnulls(${t.billItemId}, ${t.paymentId}) = 1`),
    check("receipts_size_positive", sql`${t.sizeBytes} > 0`),
    index("receipts_bill_item_id").on(t.billItemId),
    index("receipts_payment_id").on(t.paymentId),
  ],
).enableRLS();

// Written by the keep-alive job (.github/workflows/keep-alive.yml), never by the app: a real
// write, because a read alone didn't stop the free Supabase project from pausing. One row.
export const keepAlive = pgTable(
  "keep_alive",
  {
    id: integer("id").primaryKey().default(1),
    pingedAt: timestamp("pinged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("keep_alive_single_row", sql`${t.id} = 1`)],
).enableRLS();

// ---------- Relations (for typed db.query.* joins) ----------

export const membersRelations = relations(members, ({ many }) => ({
  advances: many(advances),
  billShares: many(billItemShares),
  periodBalances: many(periodBalances),
}));

export const billingPeriodsRelations = relations(billingPeriods, ({ many }) => ({
  billItems: many(billItems),
  sharedColumns: many(sharedColumns),
  advances: many(advances),
  payments: many(payments),
  balances: many(periodBalances),
}));

export const billItemsRelations = relations(billItems, ({ one, many }) => ({
  period: one(billingPeriods, { fields: [billItems.periodId], references: [billingPeriods.id] }),
  paidBy: one(members, { fields: [billItems.paidById], references: [members.id] }),
  shares: many(billItemShares),
  emails: many(billEmails),
  receipts: many(receipts),
}));

export const billItemSharesRelations = relations(billItemShares, ({ one }) => ({
  billItem: one(billItems, { fields: [billItemShares.billItemId], references: [billItems.id] }),
  member: one(members, { fields: [billItemShares.memberId], references: [members.id] }),
}));

export const sharedColumnsRelations = relations(sharedColumns, ({ one, many }) => ({
  period: one(billingPeriods, { fields: [sharedColumns.periodId], references: [billingPeriods.id] }),
  members: many(sharedColumnMembers),
  advances: many(advances),
}));

export const sharedColumnMembersRelations = relations(sharedColumnMembers, ({ one }) => ({
  column: one(sharedColumns, { fields: [sharedColumnMembers.columnId], references: [sharedColumns.id] }),
  member: one(members, { fields: [sharedColumnMembers.memberId], references: [members.id] }),
}));

export const advancesRelations = relations(advances, ({ one }) => ({
  period: one(billingPeriods, { fields: [advances.periodId], references: [billingPeriods.id] }),
  column: one(sharedColumns, { fields: [advances.columnId], references: [sharedColumns.id] }),
  payer: one(members, { fields: [advances.payerId], references: [members.id] }),
}));

export const billEmailsRelations = relations(billEmails, ({ one }) => ({
  billItem: one(billItems, { fields: [billEmails.billItemId], references: [billItems.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  period: one(billingPeriods, { fields: [payments.periodId], references: [billingPeriods.id] }),
  from: one(members, { fields: [payments.fromMemberId], references: [members.id] }),
  to: one(members, { fields: [payments.toMemberId], references: [members.id] }),
  receipts: many(receipts),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  billItem: one(billItems, { fields: [receipts.billItemId], references: [billItems.id] }),
  payment: one(payments, { fields: [receipts.paymentId], references: [payments.id] }),
  uploadedBy: one(members, { fields: [receipts.uploadedById], references: [members.id] }),
}));

export const periodBalancesRelations = relations(periodBalances, ({ one }) => ({
  period: one(billingPeriods, { fields: [periodBalances.periodId], references: [billingPeriods.id] }),
  member: one(members, { fields: [periodBalances.memberId], references: [members.id] }),
}));

// ---------- Row types ----------

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type BillingPeriod = typeof billingPeriods.$inferSelect;
export type BillItem = typeof billItems.$inferSelect;
export type NewBillItem = typeof billItems.$inferInsert;
export type BillItemShare = typeof billItemShares.$inferSelect;
export type Advance = typeof advances.$inferSelect;
export type NewAdvance = typeof advances.$inferInsert;
export type SharedColumn = typeof sharedColumns.$inferSelect;
export type SharedColumnMember = typeof sharedColumnMembers.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type BillEmailRow = typeof billEmails.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type PeriodBalance = typeof periodBalances.$inferSelect;
