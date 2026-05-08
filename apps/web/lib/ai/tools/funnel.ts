// Funnel CRUD tools — list, get details, create-from-spec, edit steps,
// edit pricing, edit bumps, grant tags, delete.

import { z } from "zod";
import { db } from "@launchtic/database";
import { SUPPORTED_CURRENCY_CODES } from "@launchtic/types";
import { defineTool, type ToolContext } from "./define";
import { fmtMoney, findOrCreateTag, findOrCreatePhysicalProduct } from "./helpers";
import { extractSlotsFromPageJson } from "../../page-templates/slots";
import { fillSlotsInPageJson } from "../../page-templates/slot-filler";
import { fillSlotsWithAI } from "../../page-templates/ai-fill";
import { generateUniqueSlug } from "../../funnels/slug-validation";

// Stripe + PayPal intersection. Source of truth: @launchtic/types.
// VND, IDR, INR etc. are NOT supported (Stripe lacks them, or PayPal does).
// Cast to readonly tuple for z.enum.
const CURRENCY_TUPLE = SUPPORTED_CURRENCY_CODES as unknown as readonly [string, ...string[]];

// ─── Reads ──────────────────────────────────────────────────────────────────

const listFunnels = defineTool({
  name: "list_funnels",
  description: "List sales funnels in the workspace with their structure. Use to find funnel/step IDs for follow-up edits, or to check if a funnel name already exists.",
  inputSchema: z.object({
    includeSteps: z.boolean().default(false).describe("Include step list per funnel."),
  }),
  requiresConfirm: false,
  execute: async ({ includeSteps }, ctx) => {
    const funnels = await db.funnel.findMany({
      // Skip trashed funnels — AI shouldn't surface deleted items.
      // User can restore from the Trash view in the UI if needed.
      where: { workspaceId: ctx.workspaceId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, name: true, currency: true, status: true,
        steps: includeSteps
          ? { orderBy: { order: "asc" }, select: { id: true, name: true, type: true, order: true } }
          : false,
        _count: { select: { steps: true } },
      },
    });
    return {
      count: funnels.length,
      funnels: funnels.map((f) => ({
        id: f.id,
        name: f.name,
        currency: f.currency.toUpperCase(),
        status: f.status,
        stepCount: f._count.steps,
        ...(includeSteps && { steps: f.steps }),
      })),
    };
  },
});

const getFunnelDetails = defineTool({
  name: "get_funnel_details",
  description:
    "Get full structure of a single funnel: steps, price plans, order bumps, granted tags. " +
    "Use BEFORE editing (update_step_price_plan, add_order_bump, etc.) to find IDs of plans/bumps/steps.",
  inputSchema: z.object({
    funnelId: z.string().describe("Funnel ID. Use list_funnels to find."),
  }),
  requiresConfirm: false,
  execute: async ({ funnelId }, ctx) => {
    const funnel = await db.funnel.findFirst({
      where: { id: funnelId, workspaceId: ctx.workspaceId },
      select: {
        id: true, name: true, currency: true, status: true,
        steps: {
          orderBy: { order: "asc" },
          select: {
            id: true, name: true, type: true, order: true, slug: true,
            offerType: true, physicalProductId: true, shippingFee: true,
            pricePlans: {
              select: { id: true, name: true, type: true, amount: true, interval: true, trialDays: true },
            },
            orderBumps: {
              orderBy: { order: "asc" },
              select: {
                id: true, label: true, headline: true,
                offerType: true, physicalProductId: true, shippingFee: true,
                pricePlans: { select: { id: true, name: true, type: true, amount: true, interval: true } },
              },
            },
            resources: { select: { id: true, type: true, resourceId: true } },
          },
        },
      },
    });
    if (!funnel) return { error: "Funnel not found" };

    // Resolve tag names for resources
    const allTagIds = new Set<string>();
    for (const s of funnel.steps) for (const r of s.resources) if (r.type === "TAG") allTagIds.add(r.resourceId);
    const tags = allTagIds.size > 0
      ? await db.tag.findMany({ where: { id: { in: [...allTagIds] }, workspaceId: ctx.workspaceId }, select: { id: true, name: true } })
      : [];
    const tagNameById = new Map(tags.map((t) => [t.id, t.name]));

    return {
      id: funnel.id,
      name: funnel.name,
      currency: funnel.currency.toUpperCase(),
      status: funnel.status,
      steps: funnel.steps.map((s) => ({
        id: s.id, name: s.name, type: s.type, slug: s.slug, order: s.order,
        offerType: s.offerType,
        shippingFee: s.shippingFee ? fmtMoney(s.shippingFee, funnel.currency) : null,
        pricePlans: s.pricePlans.map((p) => ({
          id: p.id, name: p.name, type: p.type,
          amount: fmtMoney(p.amount, funnel.currency),
          interval: p.interval, trialDays: p.trialDays,
        })),
        orderBumps: s.orderBumps.map((b) => ({
          id: b.id, label: b.label, headline: b.headline, offerType: b.offerType,
          shippingFee: b.shippingFee ? fmtMoney(b.shippingFee, funnel.currency) : null,
          pricePlans: b.pricePlans.map((p) => ({
            id: p.id, name: p.name, type: p.type,
            amount: fmtMoney(p.amount, funnel.currency),
            interval: p.interval,
          })),
        })),
        grantedTags: s.resources
          .filter((r) => r.type === "TAG")
          .map((r) => tagNameById.get(r.resourceId) ?? r.resourceId),
      })),
    };
  },
});

// ─── Writes ─────────────────────────────────────────────────────────────────

// Reusable zod sub-schemas for offer config (DIGITAL/PHYSICAL).
// Kept here to avoid duplication across product/bump/upsell shapes.
const productSchema = z.object({
  name: z.string().min(1).describe("Main product name shown on checkout. E.g. 'SEO Ebook'."),
  offerType: z.enum(["DIGITAL", "PHYSICAL"]).default("DIGITAL"),
  price: z.number().positive().describe("Price in DOLLARS (not cents). E.g. 30 for $30."),
  pricingType: z.enum(["ONE_TIME", "SUBSCRIPTION"]).default("ONE_TIME"),
  interval: z.enum(["month", "year"]).optional().describe("For SUBSCRIPTION only."),
  trialDays: z.number().int().min(0).max(365).optional().describe("For SUBSCRIPTION only."),
  sku: z.string().optional().describe("For PHYSICAL only — product SKU."),
  shippingFee: z.number().min(0).default(0).describe("For PHYSICAL only — shipping fee in dollars."),
  grantTagNames: z.array(z.string()).optional().describe("Tag names granted on purchase. Auto-created if missing."),
});

const bumpSchema = z.object({
  name: z.string().min(1).describe("Bump label, e.g. 'Bonus templates'."),
  headline: z.string().optional().describe("Short pitch sentence shown on checkout."),
  offerType: z.enum(["DIGITAL", "PHYSICAL"]).default("DIGITAL"),
  price: z.number().positive(),
  pricingType: z.enum(["ONE_TIME", "SUBSCRIPTION"]).default("ONE_TIME"),
  interval: z.enum(["month", "year"]).optional(),
  sku: z.string().optional(),
  shippingFee: z.number().min(0).default(0),
  grantTagNames: z.array(z.string()).optional(),
});

const createFunnelFromSpec = defineTool({
  name: "create_funnel_from_spec",
  description:
    "Create a complete funnel scaffold. Two flavors:\n" +
    "  • funnelType='direct_sale' (DEFAULT) — Sales → Checkout → Thank You. For paid products.\n" +
    "  • funnelType='lead_capture'           — Optin → Thank You. For free lead magnets\n" +
    "    (PDF download, newsletter signup, webinar registration, free guide). NO checkout, NO price.\n\n" +
    "Pick the right funnelType. DO NOT improvise prices like $1 to bypass validation — that's wrong.\n" +
    "If user says 'free', 'lead magnet', 'newsletter signup', 'PDF download', 'collect email' → lead_capture.\n" +
    "If user gives a price or says 'sell', 'buy', 'paid' → direct_sale.\n\n" +
    "Set offerType: DIGITAL for info-products / courses / ebooks / SaaS. PHYSICAL for shipped goods.\n" +
    "Tags in grantTagNames auto-created if missing. Currency defaults to 'usd' — only the\n" +
    "  Stripe+PayPal intersection is supported (see `currency` enum). VND/IDR/INR/etc.\n" +
    "  are NOT processable. If user requests unsupported currency, default to 'usd'.\n" +
    "Funnel created as DRAFT — operator customizes in editor after.\n\n" +
    "BEST PRACTICE — gather a `brief` BEFORE calling so page copy is meaningful:\n" +
    "  Ask user: audience, key benefits, pain point, tone (urgent/friendly/premium/professional).\n" +
    "  User may say 'skip' — pass whatever you have. Tool ALWAYS fills slots (generic fallback).\n" +
    "  Slots like {{headline}} are NEVER left raw in the output.\n\n" +
    "DON'T pre-confirm template choices in chat — pick the best match silently using\n" +
    "  list_page_templates with `tags` filter (niche/style/mood from product context).\n" +
    "  Tool requires operator confirmation via confirm card before executing.\n" +
    "  Listing template names + asking 'OK?' in chat is redundant friction.\n\n" +
    "Be concise. Don't explain validation logic or workarounds in chat — pick the right\n" +
    "  funnelType + brief and call the tool. The confirm card shows the plan to the operator.\n\n" +
    "Templates are language-neutral scaffolds (structure + {{slot}} placeholders). The AI\n" +
    "  slot-fill generates copy in whatever language the brief / user request implies.\n" +
    "  DO NOT comment on template's placeholder language being English vs the user's language\n" +
    "  — it's irrelevant, output language depends on brief context, not template metadata.",
  inputSchema: z.object({
    funnelName: z.string().min(1).describe("Funnel name. E.g. 'SEO Ebook Funnel', '10 SEO Mistakes Lead Magnet'."),
    currency: z.enum(CURRENCY_TUPLE).default("usd").describe(
      "Lowercase currency code. Stripe + PayPal intersection only. Supported: " +
      SUPPORTED_CURRENCY_CODES.join(", ") + ". " +
      "VND, IDR, INR, etc. are NOT supported — Stripe / PayPal don't process them. " +
      "If user requests an unsupported currency, default to 'usd' and mention the limit briefly."
    ),
    funnelType: z.enum(["direct_sale", "lead_capture"]).default("direct_sale")
      .describe("'direct_sale' = paid product (Sales→Checkout→Thank You). 'lead_capture' = free lead magnet (Optin→Thank You)."),
    product: productSchema.optional()
      .describe("Required when funnelType='direct_sale'. Omit when funnelType='lead_capture'."),
    leadMagnet: z.object({
      name: z.string().min(1).describe("What's being given away. E.g. '10 SEO Mistakes PDF', 'Free Webinar: AI Marketing'."),
      grantTagNames: z.array(z.string()).optional().describe("Tags applied to contact upon optin (auto-created if missing)."),
    }).optional()
      .describe("Required when funnelType='lead_capture'. Omit when funnelType='direct_sale'."),
    bumps: z.array(bumpSchema).default([]).describe("Order bumps shown on the checkout page. Only used for direct_sale."),
    templateIds: z.object({
      optin:    z.string().optional().describe("Template ID for OPTIN step (lead_capture only)."),
      sales:    z.string().optional().describe("Template ID for SALES step (direct_sale only)."),
      checkout: z.string().optional().describe("Template ID for CHECKOUT step (direct_sale only)."),
      thankyou: z.string().optional().describe("Template ID for THANKYOU step (both flavors)."),
    }).optional().describe(
      "Optional per-step template picks. Use list_page_templates first to find best match by tags."
    ),
    brief: z.object({
      audience: z.string().optional().describe("Target audience — 1 sentence."),
      painPoint: z.string().optional().describe("The main pain solved."),
      benefits: z.array(z.string()).max(5).optional().describe("Top 2-5 benefits (short phrases)."),
      tone: z.enum(["professional", "friendly", "urgent", "premium"]).optional().describe("Brand voice. Defaults to 'professional'."),
    }).optional().describe(
      "Context for AI to fill page copy slots. All sub-fields optional. " +
      "Sparse brief → tool generates generic on-brand copy from name. Pass whatever user shared."
    ),
  }),
  requiresConfirm: true,
  summary: (a) => {
    const lines: string[] = [];
    const cur = (a.currency ?? "usd").toUpperCase();
    const isLeadCapture = a.funnelType === "lead_capture";
    lines.push(`Create funnel "${a.funnelName}" (${cur}):`);

    if (isLeadCapture) {
      lines.push(`  • Optin → Thank You (lead capture, no checkout)`);
      const lm = a.leadMagnet;
      if (lm) {
        lines.push(`  • Lead magnet: ${lm.name}`);
        if (lm.grantTagNames?.length) {
          lines.push(`    Grants tags on optin: ${lm.grantTagNames.map((t: string) => `"${t}"`).join(", ")}`);
        }
      }
    } else {
      lines.push(`  • Sales page → Checkout → Thank you`);
      const product = a.product;
      if (product) {
        const priceLabel = product.pricingType === "SUBSCRIPTION"
          ? `$${product.price}/${product.interval ?? "month"}${product.trialDays ? ` w/ ${product.trialDays}d trial` : ""}`
          : `$${product.price}`;
        lines.push(`  • Product: ${product.name} (${product.offerType.toLowerCase()}) — ${priceLabel}`);
        if (product.grantTagNames?.length) {
          lines.push(`    Grants tags: ${product.grantTagNames.map((t: string) => `"${t}"`).join(", ")}`);
        }
      }
      if (a.bumps?.length) {
        lines.push(`  • ${a.bumps.length} order bump${a.bumps.length > 1 ? "s" : ""}: ${a.bumps.map((b: any) => `${b.name} ($${b.price})`).join(", ")}`);
      }
    }
    return lines.join("\n");
  },
  execute: async (args, ctx) => {
    const currency = (args.currency ?? "usd").toLowerCase();
    const isLeadCapture = args.funnelType === "lead_capture";

    // Validate per funnelType — fail fast with clear errors so the AI
    // doesn't get a generic Prisma error and improvise around it.
    if (isLeadCapture) {
      if (!args.leadMagnet) {
        throw new Error("funnelType='lead_capture' requires `leadMagnet` (name + optional grantTagNames). For paid products use funnelType='direct_sale' with `product`.");
      }
    } else {
      if (!args.product) {
        throw new Error("funnelType='direct_sale' requires `product` (name + price + offerType). For free lead magnets use funnelType='lead_capture' with `leadMagnet`.");
      }
    }

    // ─── PHASE 1: resolve + slot-fill all templates OUTSIDE the transaction ───
    // AI slot-fill takes ~5-15s per step. Doing it inside db.$transaction()
    // would hold the DB connection open and exceed the default 5s timeout
    // (Prisma error: "Transaction already closed"). Resolve to plain objects
    // first, then the transaction only writes DB rows — fast (<1s).
    const benefitNotes = [
      args.brief?.painPoint && `Pain point: ${args.brief.painPoint}`,
      args.brief?.benefits?.length && `Key benefits: ${args.brief.benefits.join("; ")}`,
    ].filter(Boolean).join("\n");

    const briefIndustry = isLeadCapture
      ? (args.leadMagnet?.name ?? args.funnelName)
      : (args.product?.name ?? args.funnelName);

    const briefForFill = {
      industry: briefIndustry,
      audience: args.brief?.audience,
      tone:     args.brief?.tone ?? "professional",
      notes:    benefitNotes || undefined,
    };

    const resolveTemplate = async (type: string, overrideId?: string): Promise<any> => {
      let pageJson: any;
      if (overrideId) {
        const explicit = await db.pageTemplate.findUnique({
          where: { id: overrideId },
          select: { pageJson: true, type: true, name: true },
        });
        if (!explicit) throw new Error(`Template ${overrideId} not found`);
        if (explicit.type !== type) {
          throw new Error(`Template "${explicit.name}" is type ${explicit.type}, can't use for ${type} step`);
        }
        pageJson = explicit.pageJson;
      } else {
        const t = await db.pageTemplate.findFirst({
          where: { type: type as any, isDefault: true, isActive: true },
          select: { pageJson: true },
        }) ?? await db.pageTemplate.findFirst({
          where: { type: type as any, isActive: true },
          orderBy: { createdAt: "asc" },
          select: { pageJson: true },
        });
        pageJson = t?.pageJson ?? {};
      }
      // Slot-fill (graceful: leave raw if AI fails)
      const slots = extractSlotsFromPageJson(pageJson);
      if (slots.length === 0) return pageJson;
      try {
        const values = await fillSlotsWithAI({ workspaceId: ctx.workspaceId, slots, brief: briefForFill });
        return fillSlotsInPageJson(pageJson, values);
      } catch (e) {
        console.warn("[create_funnel_from_spec] AI slot-fill failed:", e);
        return pageJson;
      }
    };

    // Resolve templates in parallel — set varies per funnelType.
    // direct_sale: Sales + Checkout + Thank You
    // lead_capture: Optin + Thank You (no checkout, no price plans)
    let optinPageJson: any, salesPageJson: any, checkoutPageJson: any, thankyouPageJson: any;
    if (isLeadCapture) {
      [optinPageJson, thankyouPageJson] = await Promise.all([
        resolveTemplate("OPTIN", args.templateIds?.optin),
        resolveTemplate("THANKYOU", args.templateIds?.thankyou),
      ]);
    } else {
      [salesPageJson, checkoutPageJson, thankyouPageJson] = await Promise.all([
        resolveTemplate("SALES", args.templateIds?.sales),
        resolveTemplate("CHECKOUT", args.templateIds?.checkout),
        resolveTemplate("THANKYOU", args.templateIds?.thankyou),
      ]);
    }

    // ─── Pre-compute slugs OUTSIDE the transaction ───
    // generateUniqueSlug runs DB queries; doing it inside tx would slow it
    // down. The new funnel has no FunnelDomain entries yet → it will live
    // on the default URL space (overrideCustomDomainIds: []).
    const seenSlugs = new Set<string>();
    const claimSlug = (base: string) =>
      generateUniqueSlug({
        workspaceId: ctx.workspaceId,
        funnelId: "_new_funnel_", // placeholder — funnel doesn't exist yet
        baseName: base,
        seen: seenSlugs,
        overrideCustomDomainIds: [],
      });

    let optinSlug = "", salesSlug = "", checkoutSlug = "";
    if (isLeadCapture) {
      optinSlug = await claimSlug(args.leadMagnet!.name);
    } else {
      salesSlug = await claimSlug(`${args.product!.name} sales`);
      checkoutSlug = await claimSlug(args.product!.name);
    }
    const thankSlug = await claimSlug("thank-you");

    // ─── PHASE 2: atomic transaction for DB writes only ───
    return await db.$transaction(async (tx) => {

      // 1. Resolve PhysicalProducts (find-or-create). Tx-local map by name
      //    so bumps/upsell with same product name reuse the row.
      const productIdByName = new Map<string, string>();
      const collectPhysical = async (name: string, price: number, sku?: string) => {
        if (productIdByName.has(name)) return;
        const existing = await tx.physicalProduct.findFirst({
          where: {
            workspaceId: ctx.workspaceId,
            name: { equals: name.trim(), mode: "insensitive" },
            currency,
          },
          select: { id: true },
        });
        if (existing) {
          productIdByName.set(name, existing.id);
          return;
        }
        const created = await tx.physicalProduct.create({
          data: {
            workspaceId: ctx.workspaceId,
            name: name.trim(),
            price: Math.round(price * 100),
            currency,
            sku: sku ?? null,
          },
        });
        productIdByName.set(name, created.id);
      };

      // direct_sale only — physical product creation
      if (!isLeadCapture && args.product?.offerType === "PHYSICAL") {
        await collectPhysical(args.product.name, args.product.price, args.product.sku);
      }
      if (!isLeadCapture) {
        for (const bump of args.bumps ?? []) {
          if (bump.offerType === "PHYSICAL") {
            await collectPhysical(bump.name, bump.price, bump.sku);
          }
        }
      }

      // 2. Resolve tags (find-or-create) — collect from product/bumps for
      //    direct_sale, or from leadMagnet for lead_capture.
      const tagIdByName = new Map<string, string>();
      const allTagNames = new Set<string>(
        (isLeadCapture
          ? (args.leadMagnet?.grantTagNames ?? [])
          : [
              ...(args.product?.grantTagNames ?? []),
              ...((args.bumps ?? []).flatMap((b) => b.grantTagNames ?? [])),
            ]
        ).map((n) => n.trim()).filter(Boolean)
      );
      for (const name of allTagNames) {
        const existing = await tx.tag.findFirst({
          where: { workspaceId: ctx.workspaceId, name: { equals: name, mode: "insensitive" } },
          select: { id: true },
        });
        if (existing) tagIdByName.set(name, existing.id);
        else {
          const created = await tx.tag.create({
            data: { workspaceId: ctx.workspaceId, name },
          });
          tagIdByName.set(name, created.id);
        }
      }

      // 3. Create funnel
      const funnel = await tx.funnel.create({
        data: { workspaceId: ctx.workspaceId, name: args.funnelName, currency },
      });

      // 4. Page templates + slugs already resolved OUTSIDE the transaction
      //    (Phase 1 above). Slug uniqueness is enforced cross-funnel via
      //    generateUniqueSlug. Templates resolved out of tx because AI
      //    slot-fill takes 5-15s and would exceed Prisma's 5s tx timeout.

      const stepsCreated: { id: string; name: string; type: string }[] = [];
      let order = 0;

      // ─── lead_capture: Optin → Thank You ───
      if (isLeadCapture) {
        const optinStep = await tx.funnelStep.create({
          data: {
            funnelId: funnel.id,
            name: args.leadMagnet!.name,
            slug: optinSlug,
            type: "OPTIN",
            order: order++,
            pageJson: optinPageJson,
          },
        });
        stepsCreated.push({ id: optinStep.id, name: optinStep.name, type: "OPTIN" });

        // Tags granted on optin form submission — same wiring as paid step
        for (const tagName of args.leadMagnet!.grantTagNames ?? []) {
          const tagId = tagIdByName.get(tagName.trim());
          if (tagId) {
            await tx.funnelStepResource.create({
              data: { funnelStepId: optinStep.id, type: "TAG", resourceId: tagId },
            });
          }
        }
      } else {
        // ─── direct_sale: Sales → Checkout → Thank You ───
        // 5. SALES step
        const salesStep = await tx.funnelStep.create({
          data: {
            funnelId: funnel.id,
            name: `${args.product!.name} — Sales`,
            slug: salesSlug,
            type: "SALES",
            order: order++,
            pageJson: salesPageJson,
          },
        });
        stepsCreated.push({ id: salesStep.id, name: salesStep.name, type: "SALES" });

        // 6. CHECKOUT step
        const checkoutStep = await tx.funnelStep.create({
          data: {
            funnelId: funnel.id,
            name: args.product!.name,
            slug: checkoutSlug,
            type: "CHECKOUT",
            order: order++,
            pageJson: checkoutPageJson,
            offerType: args.product!.offerType,
            physicalProductId: args.product!.offerType === "PHYSICAL"
              ? productIdByName.get(args.product!.name) ?? null
              : null,
            shippingFee: args.product!.offerType === "PHYSICAL"
              ? Math.round((args.product!.shippingFee ?? 0) * 100)
              : 0,
          },
        });
        stepsCreated.push({ id: checkoutStep.id, name: checkoutStep.name, type: "CHECKOUT" });

        // CHECKOUT pricing — DIGITAL only (PHYSICAL price comes from product)
        if (args.product!.offerType === "DIGITAL") {
          await tx.stepPricePlan.create({
            data: {
              funnelStepId: checkoutStep.id,
              name: args.product!.pricingType === "SUBSCRIPTION"
                ? `$${args.product!.price}/${args.product!.interval ?? "month"}`
                : `$${args.product!.price} one-time`,
              type: args.product!.pricingType,
              amount: Math.round(args.product!.price * 100),
              currency,
              interval: args.product!.pricingType === "SUBSCRIPTION" ? (args.product!.interval ?? "month") : null,
              trialDays: args.product!.pricingType === "SUBSCRIPTION" ? (args.product!.trialDays ?? null) : null,
            },
          });
          for (const tagName of args.product!.grantTagNames ?? []) {
            const tagId = tagIdByName.get(tagName.trim());
            if (tagId) {
              await tx.funnelStepResource.create({
                data: { funnelStepId: checkoutStep.id, type: "TAG", resourceId: tagId },
              });
            }
          }
        }

        // 7. Order bumps on CHECKOUT
        for (const [idx, bump] of (args.bumps ?? []).entries()) {
        const orderBump = await tx.orderBump.create({
          data: {
            funnelStepId: checkoutStep.id,
            label: bump.name,
            headline: bump.headline ?? null,
            offerType: bump.offerType,
            physicalProductId: bump.offerType === "PHYSICAL"
              ? productIdByName.get(bump.name) ?? null
              : null,
            shippingFee: bump.offerType === "PHYSICAL"
              ? Math.round((bump.shippingFee ?? 0) * 100)
              : 0,
            order: idx,
          },
        });

        if (bump.offerType === "DIGITAL") {
          await tx.orderBumpPricePlan.create({
            data: {
              orderBumpId: orderBump.id,
              name: bump.pricingType === "SUBSCRIPTION"
                ? `+$${bump.price}/${bump.interval ?? "month"}`
                : `+$${bump.price} add-on`,
              type: bump.pricingType,
              amount: Math.round(bump.price * 100),
              currency,
              interval: bump.pricingType === "SUBSCRIPTION" ? (bump.interval ?? "month") : null,
            },
          });
          for (const tagName of bump.grantTagNames ?? []) {
            const tagId = tagIdByName.get(tagName.trim());
            if (tagId) {
              await tx.orderBumpResource.create({
                data: { orderBumpId: orderBump.id, type: "TAG", resourceId: tagId },
              });
            }
          }
        }
        }   // ← end for-bumps
      }     // ← end else (direct_sale branch)

      // 8. THANKYOU step (always last, both flavors)
      const thankStep = await tx.funnelStep.create({
        data: {
          funnelId: funnel.id,
          name: "Thank you",
          slug: thankSlug,
          type: "THANKYOU",
          order: order++,
          pageJson: thankyouPageJson,
        },
      });
      stepsCreated.push({ id: thankStep.id, name: thankStep.name, type: "THANKYOU" });

      return {
        funnelId: funnel.id,
        funnelName: funnel.name,
        currency: funnel.currency.toUpperCase(),
        stepsCreated: stepsCreated.length,
        steps: stepsCreated,
        editorUrl: `/funnels/${funnel.id}`,
        tagsCreated: Array.from(tagIdByName.keys()),
        message: `Funnel created. [Open in editor](/funnels/${funnel.id}) to customize copy + design.`,
      };
    });
  },
});

const addFunnelStep = defineTool({
  name: "add_funnel_step",
  description:
    "Add a new step to an existing funnel. " +
    "For SALES/OPTIN/THANKYOU/CUSTOM steps: only funnelId, type, name needed. " +
    "For CHECKOUT: include offerType + price/product details. " +
    "CUSTOM = generic static page (About / Privacy / Terms / Contact / FAQ) — no form, no price. " +
    "Step is auto-positioned by type (OPTIN first, CHECKOUT mid, THANKYOU last; CUSTOM appended). " +
    "Note: UPSELL/DOWNSELL exist in DB schema but aren't user-supported yet — don't create them.",
  inputSchema: z.object({
    funnelId: z.string().describe("Funnel ID. Use list_funnels to find."),
    type: z.enum(["OPTIN", "SALES", "CHECKOUT", "THANKYOU", "CUSTOM"]),
    name: z.string().min(1).describe("Step name shown internally + on page."),
    offerType: z.enum(["DIGITAL", "PHYSICAL"]).optional(),
    price: z.number().positive().optional().describe("Price in dollars. Required for CHECKOUT."),
    pricingType: z.enum(["ONE_TIME", "SUBSCRIPTION"]).default("ONE_TIME"),
    interval: z.enum(["month", "year"]).optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    sku: z.string().optional().describe("PHYSICAL only."),
    shippingFee: z.number().min(0).default(0),
    productName: z.string().optional().describe("PHYSICAL only — product name (find or create)."),
    grantTagNames: z.array(z.string()).optional(),
    templateId: z.string().optional()
      .describe("PageTemplate ID for the new step's page. Use list_page_templates({type: <step type>}) to find. Omit to use the default template for the step type."),
  }),
  requiresConfirm: true,
  summary: async (a, ctx) => {
    const f = await db.funnel.findFirst({
      where: { id: a.funnelId, workspaceId: ctx.workspaceId },
      select: { name: true },
    });
    const offer =
      ["CHECKOUT", "UPSELL", "DOWNSELL"].includes(a.type) && a.price
        ? ` ($${a.price}${a.pricingType === "SUBSCRIPTION" ? `/${a.interval ?? "month"}` : ""})`
        : "";
    return `Add ${a.type} step "${a.name}"${offer} to funnel "${f?.name ?? a.funnelId}"`;
  },
  execute: async (args, ctx) => {
    // Pre-compute slug outside transaction — generateUniqueSlug runs DB
    // queries and shouldn't share the tx connection.
    const funnelMeta = await db.funnel.findFirst({
      where: { id: args.funnelId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!funnelMeta) throw new Error("Funnel not found");
    const slug = await generateUniqueSlug({
      workspaceId: ctx.workspaceId,
      funnelId: args.funnelId,
      baseName: args.name,
    });

    return await db.$transaction(async (tx) => {
      const funnel = await tx.funnel.findFirst({
        where: { id: args.funnelId, workspaceId: ctx.workspaceId },
        select: { id: true, currency: true },
      });
      if (!funnel) throw new Error("Funnel not found");

      const requiresOffer = ["CHECKOUT", "UPSELL", "DOWNSELL"].includes(args.type);
      if (requiresOffer && !args.offerType) throw new Error(`${args.type} step requires offerType`);
      if (requiresOffer && !args.price && args.offerType === "DIGITAL") {
        throw new Error(`${args.type} DIGITAL step requires a price`);
      }

      let physicalProductId: string | null = null;
      if (requiresOffer && args.offerType === "PHYSICAL") {
        const productName = args.productName ?? args.name;
        const productPrice = args.price ?? 0;
        physicalProductId = await findOrCreatePhysicalProduct(
          { name: productName, price: Math.round(productPrice * 100), currency: funnel.currency, sku: args.sku },
          ctx,
        );
      }

      // Auto-position by type ordering: OPTIN < SALES < CHECKOUT < UPSELL < DOWNSELL < THANKYOU
      // CUSTOM steps (about/privacy/terms) sit AFTER thankyou — they're
      // not part of the conversion flow, just appended to the funnel for
      // routing/footer-link convenience.
      const TYPE_ORDER: Record<string, number> = { OPTIN: 0, SALES: 1, CHECKOUT: 2, UPSELL: 3, DOWNSELL: 4, THANKYOU: 5, CUSTOM: 6 };
      const existing = await tx.funnelStep.findMany({
        where: { funnelId: funnel.id },
        orderBy: { order: "asc" },
        select: { id: true, type: true, order: true },
      });
      const myRank = TYPE_ORDER[args.type];
      const insertBefore = existing.find((s) => TYPE_ORDER[s.type] > myRank);

      let newOrder: number;
      if (!insertBefore) {
        newOrder = (existing[existing.length - 1]?.order ?? -1) + 1;
      } else {
        newOrder = insertBefore.order;
        await tx.funnelStep.updateMany({
          where: { funnelId: funnel.id, order: { gte: newOrder } },
          data: { order: { increment: 1 } },
        });
      }

      let tpl: { pageJson: unknown } | null;
      if (args.templateId) {
        const explicit = await tx.pageTemplate.findUnique({
          where: { id: args.templateId },
          select: { pageJson: true, type: true, name: true },
        });
        if (!explicit) throw new Error(`Template ${args.templateId} not found`);
        if (explicit.type !== args.type) {
          throw new Error(`Template "${explicit.name}" is type ${explicit.type}, can't use for ${args.type} step`);
        }
        tpl = { pageJson: explicit.pageJson };
      } else {
        tpl = (await tx.pageTemplate.findFirst({ where: { type: args.type as any, isDefault: true, isActive: true }, select: { pageJson: true } }))
          ?? (await tx.pageTemplate.findFirst({ where: { type: args.type as any, isActive: true }, orderBy: { createdAt: "asc" }, select: { pageJson: true } }));
      }

      const step = await tx.funnelStep.create({
        data: {
          funnelId: funnel.id,
          name: args.name,
          slug,
          type: args.type,
          order: newOrder,
          pageJson: tpl?.pageJson ?? {},
          offerType: requiresOffer ? args.offerType : null,
          physicalProductId,
          shippingFee: requiresOffer && args.offerType === "PHYSICAL"
            ? Math.round((args.shippingFee ?? 0) * 100) : 0,
        },
      });

      if (requiresOffer && args.offerType === "DIGITAL") {
        await tx.stepPricePlan.create({
          data: {
            funnelStepId: step.id,
            name: args.pricingType === "SUBSCRIPTION"
              ? `$${args.price}/${args.interval ?? "month"}`
              : `$${args.price} one-time`,
            type: args.pricingType,
            amount: Math.round((args.price ?? 0) * 100),
            currency: funnel.currency,
            interval: args.pricingType === "SUBSCRIPTION" ? (args.interval ?? "month") : null,
            trialDays: args.pricingType === "SUBSCRIPTION" ? (args.trialDays ?? null) : null,
          },
        });
      }

      if (args.grantTagNames?.length) {
        for (const tagName of args.grantTagNames) {
          const tagId = await findOrCreateTag(tagName, ctx);
          await tx.funnelStepResource.create({
            data: { funnelStepId: step.id, type: "TAG", resourceId: tagId },
          });
        }
      }

      return {
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
        message: `Step "${step.name}" added. [Open in editor](/funnels/${funnel.id})`,
      };
    });
  },
});

const addOrderBump = defineTool({
  name: "add_order_bump",
  description:
    "Add an order bump (one-click upsell offer at checkout) to an existing CHECKOUT/UPSELL/DOWNSELL step. " +
    "Use get_funnel_details to find the stepId.",
  inputSchema: z.object({
    stepId: z.string().describe("Funnel step ID (must be CHECKOUT/UPSELL/DOWNSELL)."),
    label: z.string().min(1).describe("Bump label, e.g. 'Bonus templates'."),
    headline: z.string().optional().describe("Short pitch sentence."),
    offerType: z.enum(["DIGITAL", "PHYSICAL"]).default("DIGITAL"),
    price: z.number().positive(),
    pricingType: z.enum(["ONE_TIME", "SUBSCRIPTION"]).default("ONE_TIME"),
    interval: z.enum(["month", "year"]).optional(),
    productName: z.string().optional().describe("PHYSICAL only — product name (find or create)."),
    sku: z.string().optional(),
    shippingFee: z.number().min(0).default(0),
    grantTagNames: z.array(z.string()).optional(),
  }),
  requiresConfirm: true,
  summary: async (a, ctx) => {
    const step = await db.funnelStep.findFirst({
      where: { id: a.stepId, funnel: { workspaceId: ctx.workspaceId } },
      select: { name: true, funnel: { select: { name: true } } },
    });
    const stepLabel = step ? `"${step.name}" (${step.funnel.name})` : a.stepId;
    return `Add bump "${a.label}" ($${a.price}) to ${stepLabel}`;
  },
  execute: async (args, ctx) => {
    return await db.$transaction(async (tx) => {
      const step = await tx.funnelStep.findFirst({
        where: { id: args.stepId, funnel: { workspaceId: ctx.workspaceId } },
        select: { id: true, type: true, funnel: { select: { id: true, currency: true } } },
      });
      if (!step) throw new Error("Step not found");
      if (!["CHECKOUT", "UPSELL", "DOWNSELL"].includes(step.type)) {
        throw new Error(`Cannot add bump to ${step.type} step`);
      }

      let physicalProductId: string | null = null;
      if (args.offerType === "PHYSICAL") {
        const productName = args.productName ?? args.label;
        physicalProductId = await findOrCreatePhysicalProduct(
          { name: productName, price: Math.round(args.price * 100), currency: step.funnel.currency, sku: args.sku },
          ctx,
        );
      }

      const lastBump = await tx.orderBump.findFirst({
        where: { funnelStepId: step.id },
        orderBy: { order: "desc" },
        select: { order: true },
      });

      const bump = await tx.orderBump.create({
        data: {
          funnelStepId: step.id,
          label: args.label,
          headline: args.headline ?? null,
          offerType: args.offerType,
          physicalProductId,
          shippingFee: args.offerType === "PHYSICAL" ? Math.round((args.shippingFee ?? 0) * 100) : 0,
          order: (lastBump?.order ?? -1) + 1,
        },
      });

      if (args.offerType === "DIGITAL") {
        await tx.orderBumpPricePlan.create({
          data: {
            orderBumpId: bump.id,
            name: args.pricingType === "SUBSCRIPTION"
              ? `+$${args.price}/${args.interval ?? "month"}`
              : `+$${args.price} add-on`,
            type: args.pricingType,
            amount: Math.round(args.price * 100),
            currency: step.funnel.currency,
            interval: args.pricingType === "SUBSCRIPTION" ? (args.interval ?? "month") : null,
          },
        });
        if (args.grantTagNames?.length) {
          for (const tagName of args.grantTagNames) {
            const tagId = await findOrCreateTag(tagName, ctx);
            await tx.orderBumpResource.create({
              data: { orderBumpId: bump.id, type: "TAG", resourceId: tagId },
            });
          }
        }
      }

      return {
        bumpId: bump.id,
        label: bump.label,
        message: `Bump "${bump.label}" added. [Open in editor](/funnels/${step.funnel.id})`,
      };
    });
  },
});

const updateStepPricePlan = defineTool({
  name: "update_step_price_plan",
  description:
    "Update the price of a CHECKOUT/UPSELL/DOWNSELL step (the main offer). " +
    "Use get_funnel_details to find the planId — it's the `id` inside step.pricePlans (NOT step.orderBumps[].pricePlans). " +
    "For order bump prices, use update_order_bump_price instead.",
  inputSchema: z.object({
    planId: z.string().describe("StepPricePlan ID. From get_funnel_details → steps[].pricePlans[].id"),
    amount: z.number().positive().describe("New price in dollars."),
  }),
  requiresConfirm: true,
  summary: async (a, ctx) => {
    const plan = await db.stepPricePlan.findFirst({
      where: { id: a.planId, funnelStep: { funnel: { workspaceId: ctx.workspaceId } } },
      select: { name: true, amount: true, currency: true, funnelStep: { select: { name: true } } },
    });
    if (!plan) return `Update price plan ${a.planId} → $${a.amount}`;
    return `Change "${plan.name}" on "${plan.funnelStep.name}" from ${fmtMoney(plan.amount, plan.currency)} → $${a.amount}`;
  },
  execute: async (args, ctx) => {
    const plan = await db.stepPricePlan.findFirst({
      where: { id: args.planId, funnelStep: { funnel: { workspaceId: ctx.workspaceId } } },
      select: { id: true, name: true, type: true, amount: true, currency: true, interval: true },
    });
    if (!plan) throw new Error("Price plan not found");

    const newAmount = Math.round(args.amount * 100);
    const newName = plan.type === "SUBSCRIPTION"
      ? `$${args.amount}/${plan.interval ?? "month"}`
      : `$${args.amount} one-time`;

    const updated = await db.stepPricePlan.update({
      where: { id: plan.id },
      data: { amount: newAmount, name: newName },
    });
    return {
      planId: updated.id,
      previousAmount: fmtMoney(plan.amount, plan.currency),
      newAmount: fmtMoney(newAmount, plan.currency),
    };
  },
});

const updateOrderBumpPrice = defineTool({
  name: "update_order_bump_price",
  description:
    "Update the price of an order bump (the +$X add-on shown at checkout). " +
    "Use get_funnel_details to find the planId — it's the `id` inside step.orderBumps[].pricePlans (NOT step.pricePlans). " +
    "DIGITAL bumps only — PHYSICAL bump prices come from the linked PhysicalProduct.",
  inputSchema: z.object({
    planId: z.string().describe("OrderBumpPricePlan ID. From get_funnel_details → steps[].orderBumps[].pricePlans[].id"),
    amount: z.number().positive().describe("New price in dollars."),
  }),
  requiresConfirm: true,
  summary: async (a, ctx) => {
    const plan = await db.orderBumpPricePlan.findFirst({
      where: { id: a.planId, orderBump: { funnelStep: { funnel: { workspaceId: ctx.workspaceId } } } },
      select: {
        name: true, amount: true, currency: true,
        orderBump: { select: { label: true, funnelStep: { select: { name: true } } } },
      },
    });
    if (!plan) return `Update bump price plan ${a.planId} → $${a.amount}`;
    return `Change bump "${plan.orderBump.label}" on "${plan.orderBump.funnelStep.name}" from ${fmtMoney(plan.amount, plan.currency)} → $${a.amount}`;
  },
  execute: async (args, ctx) => {
    const plan = await db.orderBumpPricePlan.findFirst({
      where: { id: args.planId, orderBump: { funnelStep: { funnel: { workspaceId: ctx.workspaceId } } } },
      select: { id: true, name: true, type: true, amount: true, currency: true, interval: true },
    });
    if (!plan) throw new Error("Bump price plan not found");

    const newAmount = Math.round(args.amount * 100);
    const newName = plan.type === "SUBSCRIPTION"
      ? `+$${args.amount}/${plan.interval ?? "month"}`
      : `+$${args.amount} add-on`;

    const updated = await db.orderBumpPricePlan.update({
      where: { id: plan.id },
      data: { amount: newAmount, name: newName },
    });
    return {
      planId: updated.id,
      previousAmount: fmtMoney(plan.amount, plan.currency),
      newAmount: fmtMoney(newAmount, plan.currency),
    };
  },
});

const grantTagOnPurchase = defineTool({
  name: "grant_tag_on_purchase",
  description:
    "Add a tag grant to a funnel step — when a customer purchases this step, the tag is auto-added to their contact. " +
    "Tag is auto-created if it doesn't exist.",
  inputSchema: z.object({
    stepId: z.string().describe("Funnel step ID."),
    tagName: z.string().min(1).describe("Tag name (created if missing)."),
  }),
  requiresConfirm: true,
  summary: async (a, ctx) => {
    const step = await db.funnelStep.findFirst({
      where: { id: a.stepId, funnel: { workspaceId: ctx.workspaceId } },
      select: { name: true },
    });
    return `Grant tag "${a.tagName}" on purchase of "${step?.name ?? a.stepId}"`;
  },
  execute: async (args, ctx) => {
    return await db.$transaction(async (tx) => {
      const step = await tx.funnelStep.findFirst({
        where: { id: args.stepId, funnel: { workspaceId: ctx.workspaceId } },
        select: { id: true, name: true, funnel: { select: { id: true } } },
      });
      if (!step) throw new Error("Step not found");

      const tagId = await findOrCreateTag(args.tagName, ctx);

      const existing = await tx.funnelStepResource.findFirst({
        where: { funnelStepId: step.id, type: "TAG", resourceId: tagId },
        select: { id: true },
      });
      if (existing) {
        return { stepName: step.name, tagName: args.tagName, alreadyGranted: true };
      }

      await tx.funnelStepResource.create({
        data: { funnelStepId: step.id, type: "TAG", resourceId: tagId },
      });
      return {
        stepName: step.name,
        tagName: args.tagName,
        message: `Tag "${args.tagName}" will be granted on purchase. [Open editor](/funnels/${step.funnel.id})`,
      };
    });
  },
});

const deleteFunnelStep = defineTool({
  name: "delete_funnel_step",
  description:
    "Delete a single step from a funnel. PERMANENT — cascades to delete the step's price plans, order bumps, and resources. " +
    "Existing orders + subscriptions tied to the step keep their snapshot data but the step itself is gone.",
  inputSchema: z.object({ stepId: z.string() }),
  requiresConfirm: true,
  summary: async (a, ctx) => {
    const step = await db.funnelStep.findFirst({
      where: { id: a.stepId, funnel: { workspaceId: ctx.workspaceId } },
      select: { name: true, type: true, funnel: { select: { name: true } } },
    });
    if (!step) return `Delete step ${a.stepId}`;
    return `⚠️ DELETE step "${step.name}" (${step.type}) from funnel "${step.funnel.name}". This cascades to all its price plans, bumps, and tag grants.`;
  },
  execute: async (args, ctx) => {
    const step = await db.funnelStep.findFirst({
      where: { id: args.stepId, funnel: { workspaceId: ctx.workspaceId } },
      select: { id: true, name: true, type: true, funnelId: true },
    });
    if (!step) throw new Error("Step not found");
    await db.funnelStep.delete({ where: { id: step.id } });
    return { deletedStepId: step.id, name: step.name, type: step.type };
  },
});

const deleteFunnel = defineTool({
  name: "delete_funnel",
  description:
    "Move a funnel to trash. Reversible — user can restore from the Trash view in /funnels. " +
    "The funnel and all its steps stay in the database; only the live URL stops working. " +
    "For permanent deletion the user must empty the trash manually in the UI.",
  inputSchema: z.object({ funnelId: z.string() }),
  requiresConfirm: true,
  summary: async (a, ctx) => {
    const funnel = await db.funnel.findFirst({
      where: { id: a.funnelId, workspaceId: ctx.workspaceId },
      select: { name: true, _count: { select: { steps: true } } },
    });
    if (!funnel) return `Move funnel ${a.funnelId} to trash`;
    return `Move funnel "${funnel.name}" (${funnel._count.steps} steps) to trash. Reversible from /funnels → Trash.`;
  },
  execute: async (args, ctx) => {
    const funnel = await db.funnel.findFirst({
      where: { id: args.funnelId, workspaceId: ctx.workspaceId },
      select: { id: true, name: true, status: true },
    });
    if (!funnel) throw new Error("Funnel not found");
    if (funnel.status === "TRASHED") {
      return { funnelId: funnel.id, name: funnel.name, alreadyTrashed: true };
    }
    await db.funnel.update({
      where: { id: funnel.id },
      data: { status: "TRASHED" },
    });
    return { funnelId: funnel.id, name: funnel.name, trashed: true };
  },
});

export const funnelTools = [
  listFunnels,
  getFunnelDetails,
  createFunnelFromSpec,
  addFunnelStep,
  addOrderBump,
  updateStepPricePlan,
  updateOrderBumpPrice,
  grantTagOnPurchase,
  deleteFunnelStep,
  deleteFunnel,
];
