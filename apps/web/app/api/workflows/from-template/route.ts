// Clone a workflow template into a new Workflow row. Returns the created
// workflow so the client can router.push() to the editor.

import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { findTemplate } from "../../../../lib/workflow-templates";

const bodySchema = z.object({
  templateId: z.string().min(1),
  name:       z.string().min(1).max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("automations:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { templateId, name } = bodySchema.parse(await req.json());
    const tpl = findTemplate(templateId);
    if (!tpl) return err("Template not found", 404);

    // Resolve default sender for any SEND_EMAIL nodes — saves the operator a
    // step in the editor and keeps the workflow activatable out of the box
    // (status validation requires email nodes to have a sender).
    const defaultSender = await db.senderIdentity.findFirst({
      where:   { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select:  { name: true, email: true },
    });

    const nodes = tpl.nodes.map((n) => {
      if (n.type === "SEND_EMAIL" && defaultSender) {
        return {
          ...n,
          config: {
            ...(n.config ?? {}),
            fromName:  (n.config?.fromName  as string) || defaultSender.name,
            fromEmail: (n.config?.fromEmail as string) || defaultSender.email,
          },
        };
      }
      return n;
    });

    const wf = await db.workflow.create({
      data: {
        workspaceId,
        name:                 name ?? tpl.name,
        description:          tpl.description,
        status:               "DRAFT",
        triggerType:          tpl.triggerType,
        triggerConfig:        tpl.triggerConfig as unknown as any,
        nodes:                nodes as unknown as any,
        edges:                tpl.edges as unknown as any,
        startNodeId:          tpl.startNodeId,
        reEnrollPolicy:       tpl.reEnrollPolicy,
        reEnrollCooldownDays: tpl.reEnrollCooldownDays ?? null,
      },
    });

    return ok(wf, 201);
  } catch (error) {
    return handleError(error);
  }
}
