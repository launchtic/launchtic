import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const TRIGGER_TYPES = ["NEW_SALE", "SALE_CANCELED", "SUBSCRIPTION_PAYMENT_FAILED", "FORM_SUBMIT", "TAG_ADDED", "TAG_REMOVED", "EMAIL_LINK_CLICKED"] as const;
const ACTION_TYPES  = ["SEND_EMAIL", "ADD_TAG", "REMOVE_TAG", "WEBHOOK", "START_SEQUENCE", "END_SEQUENCE"] as const;

const actionSchema = z.object({
  // Optional id — if present and matches existing, we update; if absent, create new
  id:              z.string().optional(),
  actionType:      z.enum(ACTION_TYPES),
  actionConfig:    z.record(z.string(), z.any()).default({}),
  emailTemplateId: z.string().nullable().optional(),
  emailSubject:    z.string().nullable().optional(),
  emailHtmlBody:   z.string().nullable().optional(),
  emailFromName:   z.string().nullable().optional(),
  emailFromEmail:  z.string().email().nullable().optional(),
});

const updateSchema = z.object({
  name:          z.string().min(1).max(200).optional(),
  triggerType:   z.enum(TRIGGER_TYPES).optional(),
  triggerConfig: z.record(z.string(), z.any()).optional(),
  // If actions array is present, we replace the whole list (delete missing, upsert provided).
  actions:       z.array(actionSchema).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("automations:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const automation = await db.automation.findFirst({
      where: { id, workspaceId },
      include: { actions: { orderBy: { order: "asc" } } },
    });
    if (!automation) return err("Automation not found", 404);
    return ok(automation);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("automations:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const existing = await db.automation.findFirst({
      where: { id, workspaceId },
      include: { actions: true },
    });
    if (!existing) return err("Automation not found", 404);

    const data = updateSchema.parse(await req.json());

    // Update scalar fields
    const scalarUpdate: any = {};
    if (data.name !== undefined)          scalarUpdate.name = data.name;
    if (data.triggerType !== undefined)   scalarUpdate.triggerType = data.triggerType;
    if (data.triggerConfig !== undefined) scalarUpdate.triggerConfig = data.triggerConfig;

    // Replace-style actions sync if provided
    if (data.actions) {
      // Structural-change guard for ACTIVE automations. Trigger events fire
      // jobs against a snapshot of the action list; adding/removing actions
      // mid-run could send duplicate emails or skip steps. Content edits
      // (subject, body, sender, tag, URL) are safe — they only affect the
      // next firing. Pause to add/remove actions or change triggers.
      if (existing.status === "ACTIVE") {
        const triggerChanged =
          (data.triggerType !== undefined && data.triggerType !== existing.triggerType) ||
          (data.triggerConfig !== undefined &&
            JSON.stringify(data.triggerConfig) !== JSON.stringify(existing.triggerConfig));
        if (triggerChanged) {
          return err("Pause the automation to change the trigger.", 400);
        }
        const incomingIds = data.actions.map((a) => a.id).filter(Boolean) as string[];
        const existingIds = existing.actions.map((a) => a.id);
        const sameLength = incomingIds.length === existingIds.length && incomingIds.length === data.actions.length;
        const sameSet = sameLength && incomingIds.every((id) => existingIds.includes(id));
        if (!sameSet) {
          return err("Pause the automation to add, remove, or reorder actions.", 400);
        }
        // Block actionType swap on existing actions (e.g. SEND_EMAIL → WEBHOOK)
        // — would silently drop the now-orphaned config fields.
        for (const incoming of data.actions) {
          const orig = existing.actions.find((a) => a.id === incoming.id);
          if (orig && orig.actionType !== incoming.actionType) {
            return err("Pause the automation to change action types.", 400);
          }
        }
      }

      // SEND_EMAIL actions need a sender — resolve to the workspace's default
      // identity when the user didn't pick one. Block save if the workspace
      // has no Sender Identity yet.
      const sendEmailActions = data.actions.filter((a) => a.actionType === "SEND_EMAIL");
      const needsDefault = sendEmailActions.some((a) => !a.emailFromEmail || !a.emailFromName);
      let defaultSender: { name: string; email: string } | null = null;
      if (needsDefault) {
        defaultSender = await db.senderIdentity.findFirst({
          where: { workspaceId },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: { name: true, email: true },
        });
        if (!defaultSender) {
          return err("Add a Sender Identity in Settings before saving an email action.", 400);
        }
      }

      // Determine keep / create / delete
      const incomingIds = new Set(data.actions.map((a) => a.id).filter(Boolean) as string[]);
      const toDelete = existing.actions.filter((a) => !incomingIds.has(a.id)).map((a) => a.id);

      await db.$transaction(async (tx) => {
        // Apply scalar update
        if (Object.keys(scalarUpdate).length > 0) {
          await tx.automation.update({ where: { id }, data: scalarUpdate });
        }
        // Delete removed
        if (toDelete.length > 0) {
          await tx.automationAction.deleteMany({ where: { id: { in: toDelete } } });
        }
        // Upsert each
        for (let i = 0; i < data.actions!.length; i++) {
          const a = data.actions![i];
          const isEmail = a.actionType === "SEND_EMAIL";
          const payload = {
            order:           i,
            actionType:      a.actionType,
            actionConfig:    a.actionConfig,
            emailTemplateId: a.emailTemplateId ?? null,
            emailSubject:    a.emailSubject ?? null,
            emailHtmlBody:   a.emailHtmlBody ?? null,
            emailFromName:   isEmail ? (a.emailFromName  || defaultSender!.name)  : null,
            emailFromEmail:  isEmail ? (a.emailFromEmail || defaultSender!.email) : null,
          };
          if (a.id) {
            await tx.automationAction.update({
              where: { id: a.id },
              data: payload,
            });
          } else {
            await tx.automationAction.create({
              data: { ...payload, automationId: id },
            });
          }
        }
      });
    } else if (Object.keys(scalarUpdate).length > 0) {
      await db.automation.update({ where: { id }, data: scalarUpdate });
    }

    const fresh = await db.automation.findUnique({
      where: { id },
      include: { actions: { orderBy: { order: "asc" } } },
    });
    return ok(fresh);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("automations:delete");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const existing = await db.automation.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Automation not found", 404);

    await db.automation.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
