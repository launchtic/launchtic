// CRUD for a workflow's emails. Each SEND_EMAIL node in workflow.nodes JSON
// links to one WorkflowEmail row via config.emailId; this endpoint lets the
// builder create and list them.

import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

const createSchema = z.object({
  name:      z.string().max(200).nullable().optional(),
  subject:   z.string().max(998).default(""),
  bodyHtml:  z.string().default(""),
  font:      z.string().max(50).nullable().optional(),
  fromName:  z.string().max(200).default(""),
  fromEmail: z.string().max(200).default(""),
  senderId:  z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("workflows:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;

    const wf = await db.workflow.findFirst({
      where:  { id, workspaceId },
      select: { id: true },
    });
    if (!wf) return err("Workflow not found", 404);

    const emails = await db.workflowEmail.findMany({
      where:   { workflowId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, name: true, subject: true, bodyHtml: true,
        fromName: true, fromEmail: true, senderId: true,
        sentCount: true, openedCount: true, clickedCount: true, failedCount: true,
        createdAt: true, updatedAt: true,
      },
    });
    return ok(emails);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("workflows:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;

    const wf = await db.workflow.findFirst({
      where:  { id, workspaceId },
      select: { id: true, status: true },
    });
    if (!wf) return err("Workflow not found", 404);
    if (wf.status === "ACTIVE") {
      return err("Parent workflow is active — pause it to add or edit emails.", 409);
    }

    const data = createSchema.parse(await req.json().catch(() => ({})));
    const email = await db.workflowEmail.create({
      data: {
        workspaceId,
        workflowId: id,
        name:       data.name ?? null,
        subject:    data.subject,
        bodyHtml:   data.bodyHtml,
        font:       data.font ?? null,
        fromName:   data.fromName,
        fromEmail:  data.fromEmail,
        senderId:   data.senderId ?? null,
      },
      select: {
        id: true, name: true, subject: true, bodyHtml: true,
        fromName: true, fromEmail: true, senderId: true,
        sentCount: true, openedCount: true, clickedCount: true, failedCount: true,
        createdAt: true, updatedAt: true,
      },
    });
    return ok(email, 201);
  } catch (error) {
    return handleError(error);
  }
}
