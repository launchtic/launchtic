import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  htmlBody: z.string().min(1),
  templateId: z.string().optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().optional(),
  targetType: z.enum(["ALL_CONTACTS", "TAG"]).default("ALL_CONTACTS"),
  targetTagIds: z.array(z.string()).default([]),
  excludeUnsubscribed: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess("broadcasts:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: any = { workspaceId };
    if (status && ["DRAFT", "SCHEDULED", "SENDING", "SENT", "FAILED", "CANCELED"].includes(status)) {
      where.status = status;
    }

    const broadcasts = await db.broadcast.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        subject: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        targetType: true,
        targetTagIds: true,
        totalRecipients: true,
        sentCount: true,
        failedCount: true,
        createdAt: true,
      },
    });

    return ok(broadcasts);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("broadcasts:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const body = await req.json();
    const data = createSchema.parse(body);

    // Sender resolution: snapshot is NOT NULL. Use the user's pick, or fall
    // back to the workspace's default Sender Identity. Block if no identity
    // exists at all — the operator must add one in Settings first.
    let fromEmail = data.fromEmail;
    let fromName = data.fromName;
    if (!fromEmail || !fromName) {
      const def = await db.senderIdentity.findFirst({
        where: { workspaceId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { name: true, email: true },
      });
      if (!def) {
        return err("Add a Sender Identity in Settings before creating a broadcast.", 400);
      }
      fromEmail = fromEmail ?? def.email;
      fromName = fromName ?? def.name;
    }

    const broadcast = await db.broadcast.create({
      data: {
        ...data,
        fromEmail,
        fromName,
        workspaceId,
        status: "DRAFT",
      },
    });

    return ok(broadcast, 201);
  } catch (error) {
    return handleError(error);
  }
}
