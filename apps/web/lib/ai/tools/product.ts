// Physical product catalog tools. Read-only.
//
// Note: The DB model is `PhysicalProduct` — there's no separate "digital
// product" entity. Digital deliverables live on funnel steps as
// FunnelStepResource. So "products" via AI = physical only.

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool } from "./define";
import { fmtMoney } from "./helpers";

const listProducts = defineTool({
  name: "list_products",
  description: "List physical products in the workspace catalog. Use to answer 'what products do I sell', or to find a product ID before pointing the operator at the editor.",
  inputSchema: z.object({
    search: z.string().optional().describe("Match against product name or SKU (case-insensitive substring)."),
    limit:  z.number().int().min(1).max(50).default(20),
  }),
  requiresConfirm: false,
  requiredPermission: "products:read",
  execute: async ({ search, limit }, ctx) => {
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId };
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { sku:  { contains: search.trim(), mode: "insensitive" } },
      ];
    }
    const products = await db.physicalProduct.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true, name: true, sku: true, price: true, currency: true,
        limitStock: true, stockLimit: true, hasOptions: true,
      },
    });
    return {
      count: products.length,
      products: products.map((p) => ({
        id:        p.id,
        name:      p.name,
        sku:       p.sku ?? null,
        price:     fmtMoney(p.price, p.currency),
        stock:     p.limitStock ? `${p.stockLimit ?? 0} left` : "unlimited",
        hasVariants: p.hasOptions,
      })),
    };
  },
});

const getProductDetails = defineTool({
  name: "get_product_details",
  description: "Get full details of one physical product including options/variants. Use list_products first to find the ID.",
  inputSchema: z.object({
    productId: z.string(),
  }),
  requiresConfirm: false,
  requiredPermission: "products:read",
  execute: async ({ productId }, ctx) => {
    const p = await db.physicalProduct.findFirst({
      where: { id: productId, workspaceId: ctx.workspaceId },
    });
    if (!p) return { error: "Product not found" };
    return {
      id:          p.id,
      name:        p.name,
      description: p.description ?? null,
      sku:         p.sku ?? null,
      price:       fmtMoney(p.price, p.currency),
      weight:      p.weight ?? null,
      stock:       p.limitStock ? `${p.stockLimit ?? 0} left` : "unlimited",
      imageCount:  p.images.length,
      hasVariants: p.hasOptions,
      options:     p.hasOptions ? p.options : null,
      variantCount: Array.isArray(p.variants) ? p.variants.length : 0,
    };
  },
});

export const productTools = [listProducts, getProductDetails];
