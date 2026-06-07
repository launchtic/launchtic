// PATCH / DELETE for a single WorkflowEmail. PATCH is the hot path — the
// builder debounces content edits and patches as the operator types.

import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../../lib/api";
import { requireAccess } from "../../../../../../lib/permissions";

const updateSchema = z.object({
  name:      z.string().max(200).nullable().optional(),
  subject:   z.string().max(998).optional(),
  bodyHtml:  z.string().optional(),
  fromName:  z.string().max(200).optional(),
  fromEmail: z.string().max(200).optional(),
  senderId:  z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; emailId: string }> }) {
  try {
    const r = await requireAccess("automations:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id, emailId } = await params;

    // Ownership check — workflow belongs to workspace and email belongs to
    // workflow. Server-side guard so a forged emailId can't be patched.
    const email = await db.workflowEmail.findFirst({
      where:  { id: emailId, workflowId: id, workspaceId },
      select: { id: true, workflow: { select: { status: true } } },
    });
    if (!email) return err("WorkflowEmail not found", 404);
    // Klaviyo-style lock: editing an email of an ACTIVE workflow is blocked.
    if (email.workflow.status === "ACTIVE") {
      return err("Parent workflow is active — pause it to edit emails.", 409);
    }

    const patch = updateSchema.parse(await req.json());
    const updated = await db.workflowEmail.update({
      where: { id: emailId },
      data:  patch,
      select: {
        id: true, name: true, subject: true, bodyHtml: true,
        fromName: true, fromEmail: true, senderId: true,
        sentCount: true, openedCount: true, clickedCount: true, failedCount: true,
        createdAt: true, updatedAt: true,
      },
    });
    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; emailId: string }> }) {
  try {
    const r = await requireAccess("automations:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id, emailId } = await params;

    const email = await db.workflowEmail.findFirst({
      where:  { id: emailId, workflowId: id, workspaceId },
      select: { id: true, workflow: { select: { status: true } } },
    });
    if (!email) return err("WorkflowEmail not found", 404);
    if (email.workflow.status === "ACTIVE") {
      return err("Parent workflow is active — pause it to delete emails.", 409);
    }

    // Pattern B: EmailSend has no FK back to WorkflowEmail. Historical sends
    // keep sourceType=WORKFLOW + sourceId=this.id; their content snapshot
    // lives in EmailSend.bodyHtml and the human-readable provenance in
    // EmailSend.sourceLabel. Logs UI continues to label the source via
    // sourceLabel after delete. Caller is responsible for updating any
    // SEND_EMAIL node configs that pointed at this email.
    await db.workflowEmail.delete({ where: { id: emailId } });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
