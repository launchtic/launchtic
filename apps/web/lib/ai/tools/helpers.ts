// Shared helpers used across multiple tool domains.
// Kept namespace-flat (no nested folders) — easy to grep, easy to import.

import { db } from "@launchtic/database";
import type { ToolContext } from "./define";

// ─── Money ──────────────────────────────────────────────────────────────────

export function fmtMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

// ─── Slugs ──────────────────────────────────────────────────────────────────

// Slug for FunnelStep.slug — lowercase + dashes, Vietnamese-friendly (strip
// diacritics). Trimmed to 60 chars. Empty → "step".
export function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return base || "step";
}

// ─── Find-or-create primitives ──────────────────────────────────────────────
//
// PERMISSION CASCADE (Pattern C — Hybrid):
//
// Composite tools (create_funnel_from_spec, add_funnel_step grantTagNames,
// create_broadcast TAG audience, create_contact tagNames, …) used to silently
// create Tags/Products via these helpers, gated only by the OUTER tool's
// permission (funnels:write / broadcasts:write / contacts:write). That was
// silent privilege escalation: a Marketer with `funnels:write` but NOT
// `tags:write` could create new tags by typing them as a "grant on purchase"
// — bypassing the admin's intent to lock tag creation.
//
// Fix: when the resource doesn't already exist, the helper now checks the
// SUB-permission (tags:write / products:write) before creating. Missing →
// throw a clear error so the LLM can tell the user "use an existing tag, or
// ask admin for tags:write". Existing resources are still returned freely —
// no need for read perms to *reference* known names.
//
// Owner bypasses both checks (same shortcut as everywhere else).

function hasPermission(ctx: ToolContext, perm: string): boolean {
  return ctx.isOwner || ctx.permissions.includes(perm);
}

// Two helper variants per resource:
//
//   findOrCreate*  → THROWS when user lacks the sub-perm. Use when the tool's
//                    core purpose IS the create (grant_tag_on_purchase,
//                    bulk_tag_contacts) — skipping would defeat the action.
//
//   findOrSkip*    → returns null when user lacks the sub-perm. Use for
//                    composite tools where the sub-resource is optional
//                    (create_funnel_from_spec, create_contact tagNames,
//                    add_funnel_step grantTagNames). Caller pushes the
//                    skipped name onto a `skipped[]` array so the AI can
//                    surface a brief postscript.
//
// Either way the user can REFERENCE an existing tag/product by name with
// zero sub-perm — perm gating only kicks in when something new must be
// inserted into the DB.

// Tag — case-insensitive workspace-scoped match. Reuses existing tags by name
// (no perm needed for reference). Creating new tag requires `tags:write`.
export async function findOrCreateTag(name: string, ctx: ToolContext): Promise<string> {
  const trimmed = name.trim();
  const existing = await db.tag.findFirst({
    where: { workspaceId: ctx.workspaceId, name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  if (!hasPermission(ctx, "tags:write")) {
    throw new Error(
      `Tag "${trimmed}" doesn't exist yet, and the user's role doesn't include "tags:write". ` +
      `Tell the user to either pick an existing tag (call list_tags to show options), or ask their admin to grant "tags:write" so new tags can be created here.`,
    );
  }
  const created = await db.tag.create({
    data: { workspaceId: ctx.workspaceId, name: trimmed },
  });
  return created.id;
}

// Tag — graceful-skip variant. Returns null when (a) tag doesn't exist AND
// (b) user lacks tags:write. Caller decides what to do with null (typically
// push onto a `skippedTags[]` array and omit the wiring step).
export async function findOrSkipTag(name: string, ctx: ToolContext): Promise<string | null> {
  const trimmed = name.trim();
  const existing = await db.tag.findFirst({
    where: { workspaceId: ctx.workspaceId, name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  if (!hasPermission(ctx, "tags:write")) return null;
  const created = await db.tag.create({
    data: { workspaceId: ctx.workspaceId, name: trimmed },
  });
  return created.id;
}

// PhysicalProduct — match (name + currency). Reuses existing by name+currency
// (no perm needed for reference). Creating new product requires `products:write`.
export async function findOrCreatePhysicalProduct(
  input: { name: string; price: number; currency: string; sku?: string },
  ctx: ToolContext,
): Promise<string> {
  const existing = await db.physicalProduct.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      name: { equals: input.name.trim(), mode: "insensitive" },
      currency: input.currency.toLowerCase(),
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  if (!hasPermission(ctx, "products:write")) {
    throw new Error(
      `Product "${input.name.trim()}" (${input.currency.toUpperCase()}) doesn't exist yet, and the user's role doesn't include "products:write". ` +
      `Tell the user to either pick an existing product (call list_products to show options), or ask their admin to grant "products:write" so new products can be created here.`,
    );
  }
  const created = await db.physicalProduct.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: input.name.trim(),
      price: input.price,
      currency: input.currency.toLowerCase(),
      sku: input.sku ?? null,
    },
  });
  return created.id;
}

// PhysicalProduct — graceful-skip variant. Returns null when (a) no name+currency
// match exists AND (b) user lacks products:write.
export async function findOrSkipPhysicalProduct(
  input: { name: string; price: number; currency: string; sku?: string },
  ctx: ToolContext,
): Promise<string | null> {
  const existing = await db.physicalProduct.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      name: { equals: input.name.trim(), mode: "insensitive" },
      currency: input.currency.toLowerCase(),
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  if (!hasPermission(ctx, "products:write")) return null;
  const created = await db.physicalProduct.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: input.name.trim(),
      price: input.price,
      currency: input.currency.toLowerCase(),
      sku: input.sku ?? null,
    },
  });
  return created.id;
}

// Default sender for new broadcasts/sequences/automations. Throws if workspace
// has no SenderIdentity yet — caller surfaces a clear "go to Settings" error.
export async function getDefaultSender(ctx: ToolContext): Promise<{ name: string; email: string }> {
  const sender = await db.senderIdentity.findFirst({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { name: true, email: true },
  });
  if (!sender) {
    throw new Error("No sender identity configured. Add one in Settings → Email → Sender Identities first.");
  }
  return sender;
}

// ─── Page templates ─────────────────────────────────────────────────────────

// Pick the default PageTemplate for a step type within a workspace. Order:
// isDefault → oldest → empty pageJson. Empty pageJson is still valid (operator
// customizes after). Also returns meta so callers can carry over page-level
// settings (font, seo defaults, tracking) from the template onto the new step.
export async function pickDefaultPageTemplate(workspaceId: string, stepType: string): Promise<{ pageJson: any; meta: any }> {
  const tpl =
    (await db.pageTemplate.findFirst({
      where: { workspaceId, type: stepType as any, isDefault: true, isActive: true },
      select: { pageJson: true, meta: true },
    })) ??
    (await db.pageTemplate.findFirst({
      where: { workspaceId, type: stepType as any, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { pageJson: true, meta: true },
    }));
  return { pageJson: tpl?.pageJson ?? {}, meta: tpl?.meta ?? {} };
}

// ─── Email body conversion ─────────────────────────────────────────────────

// Convert AI's plain text body → Maily TipTap JSON document.
// Splits on double newlines → paragraphs. Variable tokens like
// {{contact.firstName}} pass through verbatim (Maily substitutes at render).
// Empty input → minimal valid doc so saves don't fail isEmptyEmailDoc.
//
// Note: unsubscribe footer is NOT injected here. The worker render step
// (renderEmailContent with appendUnsubscribe) handles that — single source
// of truth, workspace-scoped customization (Settings → Email → Footer).
export function textToMailyDoc(text: string): string {
  const trimmed = (text ?? "").trim();
  const content: any[] = [];

  if (!trimmed) {
    content.push({ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: " " }] });
  } else {
    for (const p of trimmed.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)) {
      content.push({
        type: "paragraph",
        attrs: { textAlign: "left" },
        content: [{ type: "text", text: p }],
      });
    }
  }

  return JSON.stringify({ type: "doc", content });
}

// Rich email body — structured spec → Maily TipTap JSON with heading,
// paragraphs, optional CTA button, optional footer. Mirrors the shape of
// system templates in scripts_test/email-templates.seed.json so AI-generated
// emails feel polished, not bare paragraphs.
export type RichEmailBody = {
  heading?: string;
  paragraphs: string[];                              // each = 1 <p> block
  cta?: { text: string; url: string };               // call-to-action button
  footer?: string;                                   // small centered text
};

export function richBodyToMailyDoc(body: RichEmailBody): string {
  const content: any[] = [];

  if (body.heading?.trim()) {
    content.push({
      type: "heading",
      attrs: { level: 2, textAlign: "left", textDirection: "ltr", showIfKey: null },
      content: [{ type: "text", text: body.heading.trim() }],
    });
  }

  for (const p of body.paragraphs) {
    const t = p.trim();
    if (!t) continue;
    content.push({
      type: "paragraph",
      attrs: { textAlign: "left", textDirection: "ltr", showIfKey: null },
      content: [{ type: "text", text: t }],
    });
  }

  if (body.cta?.text?.trim()) {
    content.push({ type: "spacer", attrs: { height: 16, showIfKey: null } });
    content.push({
      type: "button",
      attrs: {
        text: body.cta.text.trim(),
        isTextVariable: false,
        url: body.cta.url || "#",
        isUrlVariable: false,
        alignment: "center",
        variant: "filled",
        borderRadius: "smooth",
        buttonColor: "#2563eb",
        textColor: "#ffffff",
        paddingTop: 10, paddingRight: 32, paddingBottom: 10, paddingLeft: 32,
        showIfKey: null,
      },
    });
  }

  if (body.footer?.trim()) {
    content.push({ type: "spacer", attrs: { height: 24, showIfKey: null } });
    content.push({
      type: "footer",
      attrs: { textAlign: "center", textDirection: "ltr", showIfKey: null },
      content: [{ type: "text", text: body.footer.trim() }],
    });
  }

  // Guard against empty doc — Maily rejects truly empty content arrays
  if (content.length === 0) {
    content.push({
      type: "paragraph",
      attrs: { textAlign: "left", textDirection: "ltr", showIfKey: null },
      content: [{ type: "text", text: " " }],
    });
  }

  return JSON.stringify({ type: "doc", content });
}
