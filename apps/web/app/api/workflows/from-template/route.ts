// Clone a workflow template into a new Workflow row. Returns the created
// workflow so the client can router.push() to the editor.
//
// For SEND_EMAIL nodes whose template definition carries seed content (most
// flagship templates do — Cart Abandonment ships with full 3-email copy), we
// create WorkflowEmail rows up front and rewrite the node config to reference
// them. The result: operators clone a template and get a fully populated
// workflow they can activate immediately.

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

    // Resolve default sender so SEND_EMAIL emails are activatable out of the
    // box (validation requires sender). Operator can change later.
    const defaultSender = await db.senderIdentity.findFirst({
      where:   { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select:  { id: true, name: true, email: true },
    });

    // Single transaction: create the Workflow row, create one WorkflowEmail
    // per seeded SEND_EMAIL node, then rewrite node configs with the new
    // email ids before saving. Done atomically so a failure halfway through
    // doesn't leave orphan WorkflowEmail rows.
    const wf = await db.$transaction(async (tx) => {
      const created = await tx.workflow.create({
        data: {
          workspaceId,
          name:                 name ?? tpl.name,
          description:          tpl.description,
          status:               "DRAFT",
          triggerType:          tpl.triggerType,
          triggerConfig:        tpl.triggerConfig as unknown as any,
          nodes:                [] as unknown as any, // filled in below
          edges:                tpl.edges as unknown as any,
          startNodeId:          tpl.startNodeId,
          reEnrollPolicy:       tpl.reEnrollPolicy,
          reEnrollCooldownDays: tpl.reEnrollCooldownDays ?? null,
        },
      });

      // Create one WorkflowEmail per SEND_EMAIL node carrying a seed.
      const finalNodes: any[] = [];
      for (const n of tpl.nodes) {
        if (n.type === "SEND_EMAIL") {
          const cfg     = (n.config ?? {}) as Record<string, unknown>;
          const subject = (cfg.subject  as string | undefined) ?? "";
          const body    = (cfg.bodyHtml as string | undefined) ?? "";
          // Only seed if the template actually shipped copy. Bare templates
          // (no subject/body) keep emailId=null so the operator composes.
          if (subject || body) {
            const email = await tx.workflowEmail.create({
              data: {
                workspaceId,
                workflowId: created.id,
                name:       null,
                subject,
                bodyHtml:   body,
                fromName:   (cfg.fromName  as string | undefined) || defaultSender?.name  || "",
                fromEmail:  (cfg.fromEmail as string | undefined) || defaultSender?.email || "",
                senderId:   defaultSender?.id ?? null,
              },
              select: { id: true },
            });
            finalNodes.push({
              ...n,
              config: { emailId: email.id },
            });
          } else {
            finalNodes.push({ ...n, config: { emailId: null } });
          }
        } else {
          finalNodes.push(n);
        }
      }

      return tx.workflow.update({
        where: { id: created.id },
        data:  { nodes: finalNodes as unknown as any },
      });
    });

    return ok(wf, 201);
  } catch (error) {
    return handleError(error);
  }
}
