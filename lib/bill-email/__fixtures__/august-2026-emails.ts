// The real bill emails behind the August 2026 sheet (Gmail, plain-text bodies), with account
// numbers, names, phone numbers and tracking links scrubbed. Used by the parser tests and by
// `npm run bills:import` for trying the import locally.
//
// The sheet's Meralco (₱15,463.59) and Water (₱2,173.63) are ₱15.00 and ₱7.00 above these
// emails: the Bayad convenience fee and the Dragonpay fee (receipts from Aug 31), which the
// import adds (BILL_PAYMENT_FEES in lib/household-config.ts).

import type { BillEmail } from "@/lib/bill-email/parse";

export const MERALCO_AUGUST_2026: BillEmail = {
  messageId: "<fixture-meralco-2026-08@example.test>",
  from: "customercare@meralco.com.ph",
  subject: "Meralco Bill for August 2026 for Customer Account Number (CAN) 0000000XXX",
  receivedAt: "2026-08-28T05:02:42Z",
  text: `Welcome to Meralco Online

Dear Valued Customer,

Your Meralco bill for August 2026 bill is now available online. Below is the summary of your monthly billing.

Customer Account Number (CAN): 0000000XXX

SIN: XXXXX0000000

Billing Period: 27 July 2026 to 26 August 2026

kWh Consumption: 949

Current Amount Due: PHP 15,448.59

Due Date: 06 September 2026

To access your bill and pay online, log on to your My Meralco Account or pay through our authorized payment partners using your 10-digit CAN.

This is a system-generated message and does not require a signature. Please do not reply to this email. Copyright (c) 2019. Meralco. All rights reserved`,
};

export const WATER_AUGUST_2026: BillEmail = {
  messageId: "<fixture-water-2026-08@example.test>",
  from: "etaxforms@manilawater.com",
  subject: "Manila Water Invoice for the Month of August 2026",
  receivedAt: "2026-08-26T22:08:41Z",
  text: `*Dear Katubig,*

We are pleased to share your official *Manila Water Invoice for August 2026*.
Below is a summary of your monthly billing for your reference.

| Billing Date: | 26 Aug 2026 |
| Billing Period: | 26 Jul 2026 to 26 Aug 2026 |
| Contract Account Number (CAN): | 00000000 |
| Invoice Number: | XXX0000-0000000000 |
| Consumption (cu.m.): | 44 |
| Total Amount Due: | PHP 2,166.63 |
| Due Date: | 03 Sep 2026 |

Please settle your account on or before the due date to avoid possible service disruptions.
------------------------------

*Accessing your E‑invoice*
For your protection, the attached E‑invoice is password‑protected.`,
};

export const PLDT_AUGUST_2026: BillEmail = {
  messageId: "<fixture-pldt-2026-08@example.test>",
  from: "pldthome@pldt.com.ph",
  subject: "PLDT Electronic Statement dated August 6, 2026",
  receivedAt: "2026-08-10T08:22:00Z",
  text: ` PLDT Billing Statement

| |
| Your PLDT Home eInvoice for this month is now ready for viewing! |
| Dear Valued Customer, Your eInvoice for August 2026 is now available. To access it, open the attachment and enter your 10-digit account number. For example, 0012345678. Below is the summary of your monthly billing: |

| |
| Telephone Number | : | 0000000000 |
| Statement Date | : | August 6, 2026 |
| Account Name | : | XXXXX XXXXX |
| Balance from Last Bill | : | 0.00 |
| Current Charges | : | 2,699.00 |
| Due Date | : | August 30, 2026 |
| Total Amount Due | : | 2,699.00 |

| IMPORTANT REMINDER: Your balance from last bill should be paid IMMEDIATELY and current charges should be paid ON or BEFORE your DUE DATE to prevent service interruptions. |`,
};
