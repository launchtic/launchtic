// Transaction audit log tool. Read-only by design — Transactions are an
// immutable financial record (SALE / REFUND / CHARGEBACK).
//
// Transaction has no direct workspaceId — it's linked via Order. We filter
// via order.workspaceId to scope to the current workspace.

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";
import { fmtMoney } from "./helpers";

const listTransactions = defineTool({
  name: "list_transactions",
  description: "List financial transactions (sales, refunds, chargebacks) for audit purposes. Filter by type or date range. Read-only.",
  inputSchema: z.object({
    type:  z.enum(["SALE", "REFUND", "CHARGEBACK"]).optional(),
    from:  z.string().optional().describe("Start date YYYY-MM-DD, inclusive."),
    to:    z.string().optional().describe("End date YYYY-MM-DD, inclusive."),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  requiresConfirm: false,
  requiredPermission: "transactions:read",
  execute: async ({ type, from, to, limit }, ctx) => {
    const where: Record<string, unknown> = {
      order: { workspaceId: ctx.workspaceId },
      ...(type && { type }),
    };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        range.lte = toDate;
      }
      where.createdAt = range;
    }
    const txs = await db.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, type: true, amount: true, currency: true,
        status: true, reference: true, createdAt: true,
        order: { select: { id: true, contact: { select: { email: true } } } },
      },
    });
    return {
      count: txs.length,
      transactions: txs.map((t) => ({
        id:           t.id,
        type:         t.type,
        amount:       fmtMoney(t.amount, t.currency),
        status:       t.status,
        reference:    t.reference ?? null,
        orderId:      t.order.id,
        contactEmail: t.order.contact.email,
        createdAt:    t.createdAt.toISOString(),
      })),
    };
  },
});

export const transactionTools = [listTransactions];
