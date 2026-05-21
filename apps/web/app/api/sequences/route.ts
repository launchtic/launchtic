import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";

const stepSchema = z.object({
  delayMinutes:    z.number().int().min(0).default(0),
  emailTemplateId: z.string().nullable().optional(),
  emailSubject:    z.string().min(1),
  emailHtmlBody:   z.string().min(1),
  emailFromName:   z.string().nullable().optional(),
  emailFromEmail:  z.string().email().nullable().optional(),
});

const createSchema = z.object({
  name:  z.string().min(1).max(200),
  steps: z.array(stepSchema).default([]),
});

const STATUSES = ["DRAFT", "ACTIVE", "PAUSED"] as const;

export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess("sequences:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: any = { workspaceId };
    if (status && STATUSES.includes(status as any)) where.status = status;

    const sequences = await db.emailSequence.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        totalEnrolled: true,
        activeCount: true,
        completedCount: true,
        exitedCount: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { steps: true } },
      },
    });

    return ok(sequences);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("sequences:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const data = createSchema.parse(await req.json());

    let defaultSender: { name: string; email: string } | null = null;
    if (data.steps.some((s) => !s.emailFromEmail || !s.emailFromName)) {
      defaultSender = await db.senderIdentity.findFirst({
        where: { workspaceId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { name: true, email: true },
      });
      if (!defaultSender) {
        return err("Add a Sender Identity in Settings before saving a sequence step.", 400);
      }
    }

    const sequence = await db.emailSequence.create({
      data: {
        workspaceId,
        name:   data.name,
        status: "DRAFT",
        steps: {
          create: data.steps.map((s, idx) => ({
            order:           idx,
            delayMinutes:    s.delayMinutes,
            emailTemplateId: s.emailTemplateId ?? null,
            emailSubject:    s.emailSubject,
            emailHtmlBody:   s.emailHtmlBody,
            emailFromName:   s.emailFromName  || defaultSender!.name,
            emailFromEmail:  s.emailFromEmail || defaultSender!.email,
          })),
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    return ok(sequence, 201);
  } catch (error) {
    return handleError(error);
  }
}
