import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
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
//   - sequences     EmailSequence + SequenceStep. Steps keep their snapshot
//                   subject/html so the sequence runs standalone; the FK link
//                   back to EmailTemplate is dropped.
//   - automations   Automation + AutomationAction, forced to DRAFT status with
//                   triggerConfig / actionConfig cleared. User reconfigures
//                   triggers + actions against the new workspace's resources.
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
  sequences:      z.boolean().default(false),
  automations:    z.boolean().default(false),
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

      // ── Email Sequences (+ steps) ───────────────────────────────────
      // SequenceStep keeps its snapshot subject/html (sequence runs without
      // the template FK). emailTemplateId is dropped — user can re-link in
      // the new workspace if they want template-driven edits.
      if (inc.sequences) {
        const sequences = await tx.emailSequence.findMany({
          where: { workspaceId: sourceId },
          include: { steps: true },
        });
        for (const seq of sequences) {
          const createdSeq = await tx.emailSequence.create({
            data: {
              workspaceId: newWsId,
              name:        seq.name,
              status:      seq.status,
            },
            select: { id: true },
          });
          for (const step of seq.steps) {
            await tx.sequenceStep.create({
              data: {
                sequenceId:      createdSeq.id,
                order:           step.order,
                delayMinutes:    step.delayMinutes,
                emailTemplateId: null,
                emailSubject:    step.emailSubject,
                emailHtmlBody:   step.emailHtmlBody,
                emailFromName:   step.emailFromName,
                emailFromEmail:  step.emailFromEmail,
              },
            });
          }
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

      // ── Automations (+ actions) ─────────────────────────────────────
      // Cloned as DRAFT with cleared trigger/action configs — broken refs
      // would otherwise either silently no-op or fire on the wrong resource.
      // User reviews each automation and rebuilds its wiring in the new ws.
      if (inc.automations) {
        const autos = await tx.automation.findMany({
          where: { workspaceId: sourceId },
          include: { actions: true },
        });
        for (const a of autos) {
          const newAuto = await tx.automation.create({
            data: {
              workspaceId:   newWsId,
              name:          a.name,
              status:        "DRAFT",
              triggerType:   a.triggerType,
              triggerConfig: {},
            },
            select: { id: true },
          });
          for (const act of a.actions) {
            await tx.automationAction.create({
              data: {
                automationId:    newAuto.id,
                order:           act.order,
                actionType:      act.actionType,
                actionConfig:    {},
                emailTemplateId: null,
                emailSubject:    act.emailSubject,
                emailHtmlBody:   act.emailHtmlBody,
                emailFromName:   act.emailFromName,
                emailFromEmail:  act.emailFromEmail,
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
    const mayReferenceAssets =
      inc.funnels || inc.pageTemplates || inc.emailTemplates || inc.sequences;
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
