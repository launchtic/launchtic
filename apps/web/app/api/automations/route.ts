import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";

const TRIGGER_TYPES = ["NEW_SALE", "SALE_CANCELED", "SUBSCRIPTION_PAYMENT_FAILED", "FORM_SUBMIT", "TAG_ADDED", "TAG_REMOVED", "EMAIL_LINK_CLICKED"] as const;
const ACTION_TYPES  = ["SEND_EMAIL", "ADD_TAG", "REMOVE_TAG", "WEBHOOK", "START_SEQUENCE", "END_SEQUENCE"] as const;
const STATUSES      = ["DRAFT", "ACTIVE", "PAUSED"] as const;

const actionSchema = z.object({
  actionType:      z.enum(ACTION_TYPES),
  actionConfig:    z.record(z.string(), z.any()).default({}),
  emailTemplateId: z.string().nullable().optional(),
  emailSubject:    z.string().nullable().optional(),
  emailHtmlBody:   z.string().nullable().optional(),
  emailFromName:   z.string().nullable().optional(),
  emailFromEmail:  z.string().email().nullable().optional(),
});

const createSchema = z.object({
  name:          z.string().min(1).max(200),
  triggerType:   z.enum(TRIGGER_TYPES),
  triggerConfig: z.record(z.string(), z.any()).default({}),
  actions:       z.array(actionSchema).default([]),
});

export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: any = { workspaceId };
    if (status && STATUSES.includes(status as any)) where.status = status;

    const automations = await db.automation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        triggerType: true,
        triggerConfig: true,
        timesTriggered: true,
        lastTriggeredAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { actions: true } },
      },
    });

    return ok(automations);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("automations:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const data = createSchema.parse(await req.json());

    const sendEmailActions = data.actions.filter((a) => a.actionType === "SEND_EMAIL");
    let defaultSender: { name: string; email: string } | null = null;
    if (sendEmailActions.some((a) => !a.emailFromEmail || !a.emailFromName)) {
      defaultSender = await db.senderIdentity.findFirst({
        where: { workspaceId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { name: true, email: true },
      });
      if (!defaultSender) {
        return err("Add a Sender Identity in Settings before saving an email action.", 400);
      }
    }

    const automation = await db.automation.create({
      data: {
        workspaceId,
        name:          data.name,
        triggerType:   data.triggerType,
        triggerConfig: data.triggerConfig,
        status:        "DRAFT",
        actions: {
          create: data.actions.map((a, idx) => {
            const isEmail = a.actionType === "SEND_EMAIL";
            return {
              order:           idx,
              actionType:      a.actionType,
              actionConfig:    a.actionConfig,
              emailTemplateId: a.emailTemplateId ?? null,
              emailSubject:    a.emailSubject ?? null,
              emailHtmlBody:   a.emailHtmlBody ?? null,
              emailFromName:   isEmail ? (a.emailFromName  || defaultSender!.name)  : null,
              emailFromEmail:  isEmail ? (a.emailFromEmail || defaultSender!.email) : null,
            };
          }),
        },
      },
      include: { actions: { orderBy: { order: "asc" } } },
    });

    return ok(automation, 201);
  } catch (error) {
    return handleError(error);
  }
}
