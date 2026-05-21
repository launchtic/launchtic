// Coupon management tools — list, create, attach to a funnel checkout step.
//
// Domain notes:
//   - Coupon discount is stored as: integer percentage (0-100) when type =
//     "percentage", or cents when type = "fixed". Mirrors the REST API
//     /api/coupons exactly so AI-created coupons behave identically to UI ones.
//   - Code is uppercased on save (operator-friendly: "SUMMER50" vs "summer50").
//   - Attach = append to FunnelStep.couponIds[]. Only CHECKOUT steps make
//     sense — schema allows it on others but the renderer ignores them.

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";

// ─── Reads ──────────────────────────────────────────────────────────────────

const listCoupons = defineTool({
  name: "list_coupons",
  description: "List coupons in the workspace. Use to find an existing coupon ID before attaching, or to check whether a code is already taken.",
  inputSchema: z.object({
    search:       z.string().optional().describe("Match against coupon code (case-insensitive substring)."),
    activeOnly:   z.boolean().default(true).describe("Hide expired or deactivated coupons."),
    limit:        z.number().int().min(1).max(100).default(25),
  }),
  requiresConfirm: false,
  requiredPermission: "coupons:read",
  execute: async ({ search, activeOnly, limit }, ctx) => {
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId };
    if (search?.trim()) where.code = { contains: search.trim(), mode: "insensitive" };
    if (activeOnly) where.active = true;

    const coupons = await db.coupon.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return {
      count: coupons.length,
      coupons: coupons.map((c) => ({
        id:          c.id,
        code:        c.code,
        type:        c.type,
        // Re-format fixed discounts back to dollars for readability.
        discount:    c.type === "fixed" ? (c.discount / 100).toFixed(2) : `${c.discount}%`,
        maxUses:     c.maxUses,
        usedCount:   c.usedCount,
        expiresAt:   c.expiresAt?.toISOString() ?? null,
        active:      c.active,
      })),
    };
  },
});

// ─── Writes ─────────────────────────────────────────────────────────────────

const createCoupon = defineTool({
  name: "create_coupon",
  description:
    "Create a discount coupon. " +
    "For percentage type, `discount` is 1-100 (e.g. 50 for 50%). " +
    "For fixed type, `discount` is in DOLLARS (e.g. 10 for $10 off) — the server converts to cents. " +
    "Code is auto-uppercased. Must be unique within the workspace.",
  inputSchema: z.object({
    code:     z.string().min(1).max(40).describe("Coupon code like SUMMER50 (auto-uppercased)."),
    type:     z.enum(["percentage", "fixed"]),
    discount: z.number().describe("1-100 for percentage; whole dollars for fixed."),
    maxUses:  z.number().int().positive().optional().describe("Total redemption cap. Omit for unlimited."),
    expiresAt: z.string().datetime().optional().describe("ISO 8601 UTC expiry. Omit for no expiry."),
  }),
  requiresConfirm: true,
  requiredPermission: "coupons:write",
  summary: (a) => {
    const amount = a.type === "percentage" ? `${a.discount}% off` : `$${a.discount} off`;
    const limit  = a.maxUses ? ` · max ${a.maxUses} uses` : "";
    const until  = a.expiresAt ? ` · expires ${new Date(a.expiresAt).toLocaleDateString()}` : "";
    return `Create coupon "${a.code.toUpperCase()}" (${amount}${limit}${until})`;
  },
  execute: async (args, ctx) => {
    if (args.type === "percentage" && (args.discount < 1 || args.discount > 100)) {
      throw new Error("Percentage discount must be between 1 and 100");
    }
    if (args.discount < 0) throw new Error("Discount cannot be negative");

    try {
      const coupon = await db.coupon.create({
        data: {
          workspaceId: ctx.workspaceId,
          code:        args.code.trim().toUpperCase(),
          type:        args.type,
          discount:    args.type === "fixed" ? Math.round(args.discount * 100) : args.discount,
          maxUses:     args.maxUses ?? null,
          expiresAt:   args.expiresAt ? new Date(args.expiresAt) : null,
        },
      });
      return {
        id:       coupon.id,
        code:     coupon.code,
        message:  `Coupon "${coupon.code}" created. Attach it to a CHECKOUT step with attach_coupon_to_step, or share the code directly.`,
      };
    } catch (e: any) {
      if (e?.code === "P2002") throw new Error(`Coupon code "${args.code.toUpperCase()}" already exists in this workspace.`);
      throw e;
    }
  },
});

const attachCouponToStep = defineTool({
  name: "attach_coupon_to_step",
  description:
    "Attach a coupon to a funnel CHECKOUT step so it's accepted at checkout. " +
    "Find the funnel via list_funnels/get_funnel_details to get stepId, and list_coupons to get couponId. " +
    "Idempotent — re-attaching an already-attached coupon is a no-op.",
  inputSchema: z.object({
    stepId:   z.string().describe("Funnel step ID. Must be type CHECKOUT for the coupon to actually apply."),
    couponId: z.string().describe("Coupon ID from list_coupons."),
  }),
  requiresConfirm: true,
  requiredPermission: "coupons:write",
  summary: async (a, ctx) => {
    const [step, coupon] = await Promise.all([
      db.funnelStep.findFirst({
        where: { id: a.stepId, funnel: { workspaceId: ctx.workspaceId } },
        select: { name: true, type: true, funnel: { select: { name: true } } },
      }),
      db.coupon.findFirst({
        where: { id: a.couponId, workspaceId: ctx.workspaceId },
        select: { code: true },
      }),
    ]);
    if (!step || !coupon) return `Attach coupon ${a.couponId} to step ${a.stepId}`;
    const warn = step.type !== "CHECKOUT" ? " ⚠️ Step is not a CHECKOUT — coupon won't apply." : "";
    return `Attach coupon "${coupon.code}" to "${step.name}" in funnel "${step.funnel.name}"${warn}`;
  },
  execute: async (args, ctx) => {
    const step = await db.funnelStep.findFirst({
      where: { id: args.stepId, funnel: { workspaceId: ctx.workspaceId } },
      select: { id: true, type: true, name: true, couponIds: true, funnel: { select: { id: true } } },
    });
    if (!step) throw new Error("Funnel step not found");

    const coupon = await db.coupon.findFirst({
      where: { id: args.couponId, workspaceId: ctx.workspaceId },
      select: { id: true, code: true },
    });
    if (!coupon) throw new Error("Coupon not found");

    if (step.couponIds.includes(coupon.id)) {
      return {
        attached: false,
        alreadyAttached: true,
        message: `Coupon "${coupon.code}" is already attached to step "${step.name}".`,
      };
    }

    await db.funnelStep.update({
      where: { id: step.id },
      data:  { couponIds: { push: coupon.id } },
    });

    const checkoutNote = step.type === "CHECKOUT"
      ? ""
      : ` Note: step type is ${step.type}, not CHECKOUT — the coupon is stored but won't be honored until applied on a CHECKOUT step.`;

    return {
      attached: true,
      stepName: step.name,
      couponCode: coupon.code,
      message: `Coupon "${coupon.code}" attached to "${step.name}".${checkoutNote} [Open funnel](/${ctx.workspaceSlug}/funnels/${step.funnel.id})`,
    };
  },
});

const detachCouponFromStep = defineTool({
  name: "detach_coupon_from_step",
  description: "Remove a coupon from a funnel step's allowed list. Coupon row itself is preserved — only the funnel link is dropped.",
  inputSchema: z.object({
    stepId:   z.string(),
    couponId: z.string(),
  }),
  requiresConfirm: true,
  requiredPermission: "coupons:write",
  summary: async (a, ctx) => {
    const [step, coupon] = await Promise.all([
      db.funnelStep.findFirst({
        where: { id: a.stepId, funnel: { workspaceId: ctx.workspaceId } },
        select: { name: true, funnel: { select: { name: true } } },
      }),
      db.coupon.findFirst({
        where: { id: a.couponId, workspaceId: ctx.workspaceId },
        select: { code: true },
      }),
    ]);
    if (!step || !coupon) return `Detach coupon ${a.couponId} from step ${a.stepId}`;
    return `Detach coupon "${coupon.code}" from "${step.name}" in "${step.funnel.name}"`;
  },
  execute: async (args, ctx) => {
    const step = await db.funnelStep.findFirst({
      where: { id: args.stepId, funnel: { workspaceId: ctx.workspaceId } },
      select: { id: true, name: true, couponIds: true },
    });
    if (!step) throw new Error("Funnel step not found");
    if (!step.couponIds.includes(args.couponId)) {
      return { detached: false, message: `Coupon was not attached to "${step.name}" — nothing to do.` };
    }
    await db.funnelStep.update({
      where: { id: step.id },
      data:  { couponIds: step.couponIds.filter((id) => id !== args.couponId) },
    });
    return { detached: true, stepName: step.name };
  },
});

const deleteCoupon = defineTool({
  name: "delete_coupon",
  description:
    "Permanently delete a coupon. Cannot be undone. Any FunnelStep that still references the coupon code in `couponIds` will silently drop the dead reference at next save — the AI tool surfaces an attachment warning in the confirm summary.",
  inputSchema: z.object({
    couponId: z.string().describe("Coupon ID from list_coupons."),
  }),
  requiresConfirm: true,
  requiredPermission: "coupons:delete",
  summary: async (a, ctx) => {
    const coupon = await db.coupon.findFirst({
      where: { id: a.couponId, workspaceId: ctx.workspaceId },
      select: { code: true, usedCount: true },
    });
    if (!coupon) return `Delete coupon ${a.couponId}`;
    // FunnelStep.couponIds is String[] (not FK) — count steps that still
    // reference this id so the operator sees the impact before confirming.
    const attachedSteps = await db.funnelStep.count({
      where: { funnel: { workspaceId: ctx.workspaceId }, couponIds: { has: a.couponId } },
    });
    const warnings: string[] = [];
    if (attachedSteps > 0) warnings.push(`attached to ${attachedSteps} step(s)`);
    if (coupon.usedCount > 0) warnings.push(`already used ${coupon.usedCount}×`);
    const tail = warnings.length > 0 ? ` ⚠️ ${warnings.join(", ")}` : "";
    return `Delete coupon "${coupon.code}"${tail}`;
  },
  execute: async (args, ctx) => {
    const coupon = await db.coupon.findFirst({
      where: { id: args.couponId, workspaceId: ctx.workspaceId },
      select: { id: true, code: true },
    });
    if (!coupon) throw new Error("Coupon not found");
    await db.coupon.delete({ where: { id: coupon.id } });
    return { deleted: true, code: coupon.code };
  },
});

export const couponTools = [
  listCoupons,
  createCoupon,
  attachCouponToStep,
  detachCouponFromStep,
  deleteCoupon,
];
