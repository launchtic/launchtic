// Order + revenue analytics tools. Read-only.

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";
import { fmtMoney } from "./helpers";

const listRecentOrders = defineTool({
  name: "list_recent_orders",
  description: "List the most recent orders in the workspace. Use to answer questions about recent sales activity.",
  inputSchema: z.object({
    limit:  z.number().int().min(1).max(50).default(10).describe("Number of orders to return."),
    status: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED", "CANCELED", "TRIAL"]).optional().describe("Optional status filter."),
  }),
  requiresConfirm: false,
  execute: async ({ limit, status }, ctx) => {
    const orders = await db.order.findMany({
      where: { workspaceId: ctx.workspaceId, ...(status && { status }) },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, status: true, total: true, currency: true, createdAt: true,
        contact: { select: { email: true } },
      },
    });
    return {
      count: orders.length,
      orders: orders.map((o) => ({
        id: o.id,
        status: o.status,
        amount: fmtMoney(o.total, o.currency),
        contactEmail: o.contact.email,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  },
});

const getRevenueSummary = defineTool({
  name: "get_revenue_summary",
  description: "Get total revenue and order count for a date range. Use for questions like 'revenue this week', 'sales last month'.",
  inputSchema: z.object({
    from: z.string().describe("Start date (YYYY-MM-DD), inclusive."),
    to:   z.string().describe("End date (YYYY-MM-DD), inclusive."),
  }),
  requiresConfirm: false,
  execute: async ({ from, to }, ctx) => {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    const orders = await db.order.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        status: "PAID",
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: { total: true, currency: true, refundAmount: true },
    });
    const grossCents = orders.reduce((s, o) => s + o.total, 0);
    const refundedCents = orders.reduce((s, o) => s + o.refundAmount, 0);
    const currency = orders[0]?.currency ?? "usd";
    return {
      from, to,
      orderCount: orders.length,
      grossRevenue: fmtMoney(grossCents, currency),
      refunded: fmtMoney(refundedCents, currency),
      netRevenue: fmtMoney(grossCents - refundedCents, currency),
    };
  },
});

export const orderTools = [listRecentOrders, getRevenueSummary];
