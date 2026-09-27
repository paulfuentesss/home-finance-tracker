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
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const advanceCategory = pgEnum("advance_category", ["grocery", "food", "service", "misc"]);
// "closed" = month locked; any unpaid balance carries over to the next month.
export const periodStatus = pgEnum("period_status", ["open", "closed"]);
export const billSource = pgEnum("bill_source", ["manual", "email"]);
// Email-parsed bills land as "pending" and are ignored by settlement until confirmed.
export const billStatus = pgEnum("bill_status", ["confirmed", "pending"]);

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
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("members_single_collector").on(t.isCollector).where(sql`${t.isCollector}`)],
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
    dueDate: date("due_date", { mode: "string" }),
    receiptPath: text("receipt_path"),
    source: billSource("source").notNull().default("manual"),
    status: billStatus("status").notNull().default("confirmed"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("bill_items_period_name").on(t.periodId, t.name),
    check("bill_items_total_positive", sql`${t.totalAmount} > 0`),
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
    // true = manually set; kept as-is when the bill total is edited and the rest re-split.
    isOverride: boolean("is_override").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.billItemId, t.memberId] }),
    check("bill_item_shares_amount_nonneg", sql`${t.amount} >= 0`),
  ],
).enableRLS();

export const advances = pgTable(
  "advances",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    periodId: integer("period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "restrict" }),
    payerId: integer("payer_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    category: advanceCategory("category").notNull(),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    spentOn: date("spent_on", { mode: "string" }).notNull(),
    receiptPath: text("receipt_path"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("advances_amount_positive", sql`${t.amount} > 0`)],
).enableRLS();

// Only present for custom-split advances (e.g. Ice Maker 50/12.5).
// No rows = split equally across the period's members.
export const advanceShares = pgTable(
  "advance_shares",
  {
    advanceId: integer("advance_id")
      .notNull()
      .references(() => advances.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.advanceId, t.memberId] }),
    check("advance_shares_amount_nonneg", sql`${t.amount} >= 0`),
  ],
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

// ---------- Relations (for typed db.query.* joins) ----------

export const membersRelations = relations(members, ({ many }) => ({
  advances: many(advances),
  billShares: many(billItemShares),
  periodBalances: many(periodBalances),
}));

export const billingPeriodsRelations = relations(billingPeriods, ({ many }) => ({
  billItems: many(billItems),
  advances: many(advances),
  payments: many(payments),
  balances: many(periodBalances),
}));

export const billItemsRelations = relations(billItems, ({ one, many }) => ({
  period: one(billingPeriods, { fields: [billItems.periodId], references: [billingPeriods.id] }),
  paidBy: one(members, { fields: [billItems.paidById], references: [members.id] }),
  shares: many(billItemShares),
}));

export const billItemSharesRelations = relations(billItemShares, ({ one }) => ({
  billItem: one(billItems, { fields: [billItemShares.billItemId], references: [billItems.id] }),
  member: one(members, { fields: [billItemShares.memberId], references: [members.id] }),
}));

export const advancesRelations = relations(advances, ({ one, many }) => ({
  period: one(billingPeriods, { fields: [advances.periodId], references: [billingPeriods.id] }),
  payer: one(members, { fields: [advances.payerId], references: [members.id] }),
  shares: many(advanceShares),
}));

export const advanceSharesRelations = relations(advanceShares, ({ one }) => ({
  advance: one(advances, { fields: [advanceShares.advanceId], references: [advances.id] }),
  member: one(members, { fields: [advanceShares.memberId], references: [members.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  period: one(billingPeriods, { fields: [payments.periodId], references: [billingPeriods.id] }),
  from: one(members, { fields: [payments.fromMemberId], references: [members.id] }),
  to: one(members, { fields: [payments.toMemberId], references: [members.id] }),
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
export type AdvanceShare = typeof advanceShares.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PeriodBalance = typeof periodBalances.$inferSelect;
