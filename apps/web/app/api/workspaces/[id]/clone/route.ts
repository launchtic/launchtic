import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { demoGuard } from "../../../../../lib/demo";
import { canCloneWorkspace, canCreateWorkspace } from "../../../../../lib/plan";
import { getOrganizationForOwner, getEffectivePlan } from "../../../../../lib/organization";
import { cloneAssets, rewriteWorkspaceContentAssets } from "../../../../../lib/asset-clone";

// POST /api/workspaces/[id]/clone — duplicate a workspace's "blueprint" content
// into a new workspace owned by the same user. Owner-only, Agency-plan-gated.
//
// Cloning is intentionally a *shallow blueprint copy*, not a deep duplicate:
// agencies clone a template workspace and then wire it up to each new client's
// own products, tags, payment keys, and domains. So we copy the design and the
// workflow shape — never the cross-resource references that would silently
// point back at the source workspace.
//
// What's cloned (opt-in per group):
//   - funnels       Funnel + FunnelStep (pageJson). Price plans, order bumps,
//                   resources, productId, couponIds are dropped — agencies set
//                   pricing fresh per client.
//   - emailTemplates EmailTemplate (standalone, no FKs).
//   - workflows     Workflow + WorkflowEmail. Graph nodes/edges carried as-is;
//                   SEND_EMAIL nodes have their config.emailId remapped to
//                   freshly-duplicated WorkflowEmail rows. Cloned as DRAFT
//                   with triggerConfig cleared — operator rebinds triggers
//                   to the new workspace's funnels/tags before activating.
//                   (Replaced legacy EmailSequence + Automation in Phase 1C.)
//   - pageTemplates PageTemplate + SavedBlock.
//   - roles         Role (permission preset).
//   - settings      WorkspaceSettings (SMTP, AI, storage, payment credentials,
//                   email footer). Off by default — agencies that share infra
//                   (one SMTP provider, one AI key) opt in to carry credentials
//                   to each new client workspace.
//
// What's NEVER cloned: contacts, orders, subscriptions, coupons, broadcasts,
// emailSends, automationRuns, sequenceEnrollments, senderIdentities, domains,
// aiConversations, members, products, tags.
//
// FunnelStep.pageJson is Craft.js JSON that may embed product/sequence IDs
// from the source workspace (eg. form actions). These IDs are NOT remapped —
// user must rebind references when wiring up the new workspace.

const includeSchema = z.object({
  funnels:        z.boolean().default(false),
  emailTemplates: z.boolean().default(false),
  workflows:      z.boolean().default(false),
  pageTemplates:  z.boolean().default(false),
  roles:          z.boolean().default(false),
  settings:       z.boolean().default(false),
});

const bodySchema = z.object({
  name:    z.string().min(1).max(100),
  include: includeSchema,
});

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { userId } = r;

    const { id: sourceId } = await params;
    const body = bodySchema.parse(await req.json());

    const source = await db.workspace.findUnique({
      where: { id: sourceId },
      select: { ownerId: true },
    });
    if (!source)                     return err("Workspace not found", 404);
    if (source.ownerId !== userId)   return err("Only the owner can clone this workspace", 403);

    const organization = await getOrganizationForOwner(userId);
    if (!organization) return err("Organization not found", 404);
    const plan = getEffectivePlan(organization);
    if (!canCloneWorkspace(plan)) {
      return err("Upgrade to Agency to clone workspaces.", 403);
    }
    const currentCount = await db.workspace.count({ where: { organizationId: organization.id } });
    if (!canCreateWorkspace(plan, currentCount)) {
      return err("Workspace quota reached for your plan.", 403);
    }

    const inc = body.include;

    // Allocate a unique slug outside the transaction (avoids holding a row
    // lock across a per-slug roundtrip loop).
    const baseSlug = slugify(body.name) || "workspace";
    let slug = baseSlug;
    let attempt = 0;
    while (await db.workspace.findUnique({ where: { slug } })) {
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    const newWorkspaceId = await db.$transaction(async (tx) => {
      const newWs = await tx.workspace.create({
        data: {
          name:           body.name,
          slug,
          ownerId:        userId,
          organizationId: organization.id,
        },
        select: { id: true },
      });
      const newWsId = newWs.id;

      // ── Email Templates ─────────────────────────────────────────────
      if (inc.emailTemplates) {
        const templates = await tx.emailTemplate.findMany({ where: { workspaceId: sourceId } });
        for (const t of templates) {
          await tx.emailTemplate.create({
            data: {
              workspaceId: newWsId,
              name:        t.name,
              subject:     t.subject,
              htmlBody:    t.htmlBody,
              category:    t.category,
              isSystem:    t.isSystem,
              systemKey:   t.systemKey,
            },
          });
        }
      }

      // ── Page Templates + Saved Blocks ───────────────────────────────
      if (inc.pageTemplates) {
        const pageTemplates = await tx.pageTemplate.findMany({ where: { workspaceId: sourceId } });
        for (const pt of pageTemplates) {
          await tx.pageTemplate.create({
            data: {
              workspaceId:  newWsId,
              name:         pt.name,
              description:  pt.description,
              thumbnailUrl: pt.thumbnailUrl,
              type:         pt.type,
              tags:         pt.tags,
              pageJson:     pt.pageJson ?? {},
              meta:         pt.meta ?? {},
              isDefault:    pt.isDefault,
              isActive:     pt.isActive,
            },
          });
        }
        const blocks = await tx.savedBlock.findMany({ where: { workspaceId: sourceId } });
        for (const b of blocks) {
          await tx.savedBlock.create({
            data: {
              workspaceId: newWsId,
              name:        b.name,
              kind:        b.kind,
              tags:        b.tags,
              contentJson: b.contentJson ?? {},
            },
          });
        }
      }

      // ── Workflows (graph clone + WorkflowEmail copy) ────────────────
      // Always cloned as DRAFT. Nodes/edges JSON carried as-is. SEND_EMAIL
      // node configs reference WorkflowEmail rows by id — we duplicate
      // those rows into the new workflow and remap config.emailId before
      // writing the workflow row, so the cloned workflow is self-contained
      // (operator gets a working copy with all email content, ready to
      // re-brand for the client).
      if (inc.workflows) {
        const workflows = await tx.workflow.findMany({
          where:   { workspaceId: sourceId },
          include: { emails: true },
        });
        for (const wf of workflows) {
          const newWf = await tx.workflow.create({
            data: {
              workspaceId:          newWsId,
              name:                 wf.name,
              description:          wf.description,
              status:               "DRAFT",
              triggerType:          wf.triggerType,
              triggerConfig:        {},
              nodes:                [] as any, // patched after email remap
              edges:                wf.edges as any,
              startNodeId:          null,
              reFirePolicy:         wf.reFirePolicy,
              maxDurationDays:      wf.maxDurationDays,
            },
            select: { id: true },
          });

          // Clone each WorkflowEmail into the new workflow, building a
          // remap table old emailId → new emailId.
          const idMap = new Map<string, string>();
          for (const em of wf.emails) {
            const dup = await tx.workflowEmail.create({
              data: {
                workspaceId: newWsId,
                workflowId:  newWf.id,
                name:        em.name,
                subject:     em.subject,
                bodyHtml:    em.bodyHtml,
                fromName:    em.fromName,
                fromEmail:   em.fromEmail,
                senderId:    null, // sender ids are workspace-scoped → drop
              },
              select: { id: true },
            });
            idMap.set(em.id, dup.id);
          }

          // Rewrite SEND_EMAIL config.emailId using the remap table. Any
          // emailId that's missing from the map (orphan) becomes null so the
          // operator sees a validation error rather than a stale reference.
          const sourceNodes = (wf.nodes as any[]) ?? [];
          const remappedNodes = sourceNodes.map((n) => {
            if (n?.type !== "SEND_EMAIL") return n;
            const cfg = (n.config ?? {}) as Record<string, unknown>;
            const oldId = cfg.emailId as string | undefined;
            const newId = oldId ? idMap.get(oldId) ?? null : null;
            return { ...n, config: { ...cfg, emailId: newId } };
          });

          await tx.workflow.update({
            where: { id: newWf.id },
            data:  {
              nodes:       remappedNodes as any,
              startNodeId: wf.startNodeId, // safe — node ids are unchanged
            },
          });
        }
      }

      // ── Funnels (+ steps with pageJson only) ────────────────────────
      // Pricing, bumps, and resource grants are intentionally dropped — they
      // reference products/tags/coupons that aren't cloned. User wires up
      // pricing per client after clone.
      //
      // Slug dedup: cloned funnels all land on the new ws's default PAGES_DOMAIN
      // (FunnelDomain rows aren't carried over). Source may have had two
      // funnels with the same step slug on DIFFERENT custom domains — valid
      // there, but post-clone they share one URL space and would collide
      // (silent at DB level — `@@unique([funnelId, slug])` doesn't catch it —
      // but app-layer `assertSlugAvailable` would reject any later edit, and
      // the renderer's URL resolution becomes ambiguous). So we track every
      // slug claimed across all cloned funnels in this ws and suffix `-2`,
      // `-3`, ... on collision.
      if (inc.funnels) {
        const funnels = await tx.funnel.findMany({
          where: { workspaceId: sourceId },
          include: { steps: true },
        });
        const claimedSlugs = new Set<string>();
        for (const f of funnels) {
          const newFunnel = await tx.funnel.create({
            data: {
              workspaceId: newWsId,
              name:        f.name,
              currency:    f.currency,
              favicon:     f.favicon,
              status:      f.status,
            },
            select: { id: true },
          });
          for (const s of f.steps) {
            let slug = s.slug;
            let n = 2;
            while (claimedSlugs.has(slug)) slug = `${s.slug}-${n++}`;
            claimedSlugs.add(slug);
            await tx.funnelStep.create({
              data: {
                funnelId:          newFunnel.id,
                name:              s.name,
                slug,
                type:              s.type,
                order:             s.order,
                offerType:         s.offerType,
                physicalProductId: null,
                shippingFee:       s.shippingFee,
                couponIds:         [],
                pageJson:          s.pageJson ?? {},
                meta:              s.meta ?? undefined,
              },
            });
          }
        }
      }

      // ── Roles ───────────────────────────────────────────────────────
      if (inc.roles) {
        const roles = await tx.role.findMany({ where: { workspaceId: sourceId } });
        for (const role of roles) {
          await tx.role.create({
            data: {
              workspaceId: newWsId,
              name:        role.name,
              description: role.description,
              permissions: role.permissions,
            },
          });
        }
      }

      // ── Workspace Settings (credentials, default OFF on UI) ─────────
      // Carries every credential blob — SMTP, AI key, S3, Stripe, PayPal,
      // and the email footer. Designed for agencies running shared infra
      // across client workspaces.
      if (inc.settings) {
        const settings = await tx.workspaceSettings.findUnique({ where: { workspaceId: sourceId } });
        if (settings) {
          await tx.workspaceSettings.create({
            data: {
              workspaceId:         newWsId,
              stripe:              settings.stripe      ?? undefined,
              paypal:              settings.paypal      ?? undefined,
              smtp:                settings.smtp        ?? undefined,
              // storage moved to Organization.storage — cloned workspaces
              // under the same org automatically inherit; nothing to copy here.
              ai:                  settings.ai          ?? undefined,
              emailFooter:         settings.emailFooter ?? undefined,
              // onboardingDismissed is UX state, not config — reset.
            },
          });
        }
      }

      return newWsId;
    }, { timeout: 60_000, maxWait: 5_000 });

    // ── Asset clone (post-tx) ───────────────────────────────────────────────
    // File copies happen outside the DB transaction so we don't hold a
    // connection open during slow storage I/O. If clone covers any content
    // group that may reference assets (funnels, pageTemplates, emailTemplates),
    // copy every source Asset to the new workspace and rewrite assetId + URL
    // references in cloned content. Failures here leave the workspace usable
    // but with stale source-side URLs — user can re-trigger or accept it.
    // Workflows can carry image refs through WorkflowEmail.bodyHtml; include
    // them in the asset-rewrite gate alongside the other content groups that
    // may embed uploaded media.
    const mayReferenceAssets =
      inc.funnels || inc.pageTemplates || inc.emailTemplates || inc.workflows;
    if (mayReferenceAssets) {
      try {
        const refs = await cloneAssets(sourceId, newWorkspaceId);
        await rewriteWorkspaceContentAssets(newWorkspaceId, refs);
      } catch (assetErr) {
        console.error("[workspace-clone] asset clone failed:", assetErr);
        // Don't fail the whole clone — workspace is still functional with
        // original URLs. Surface a warning header so client can flag this.
      }
    }

    const created = await db.workspace.findUniqueOrThrow({
      where: { id: newWorkspaceId },
      select: { id: true, name: true, slug: true },
    });
    return ok(created, 201);
  } catch (error) {
    return handleError(error);
  }
}
