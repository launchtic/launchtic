import { db } from "@launchtic/database";
import { notFound } from "next/navigation";
import WorkflowBuilder from "../../../../../components/workflows/WorkflowBuilder";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";

export const metadata = { title: "Workflow editor" };

export default async function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string }>;
}) {
  const { workspaceSlug, id } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "workflows:read");

  const wf = await db.workflow.findFirst({
    where: { id, workspaceId },
  });
  if (!wf) notFound();

  // Load editor dependencies in one shot:
  // - tags: ADD_TAG / REMOVE_TAG node pickers + contact_tag condition
  // - senders: SEND_EMAIL "from" picker
  // - funnels: trigger scope (NEW_SALE / FORM_SUBMIT / etc.)
  // - broadcasts: EMAIL_OPENED / EMAIL_LINK_CLICKED triggers + email_opened
  //               source="broadcast" condition. bodyHtml NOT included here —
  //               link picker fetches it on demand via /api/.../email-links.
  // - workflowEmails: SEND_EMAIL content (split out from node JSON), plus
  //                   condition email_opened source="workflow_email" picker.
  // - workspaceEmails: cross-workflow email list for the trigger
  //                    source="workflow_email" picker (need workflow name to
  //                    disambiguate emails with the same subject across
  //                    workflows). bodyHtml omitted for the same reason as
  //                    broadcasts above.
  const [tags, pipelines, senders, funnels, broadcasts, workflowEmails, workspaceEmails] = await Promise.all([
    db.tag.findMany({
      where: { workspaceId }, orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    // pipelines + stages: ADD_TO_PIPELINE action picker
    db.pipeline.findMany({
      where: { workspaceId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, name: true,
        stages: { select: { id: true, name: true, color: true }, orderBy: { position: "asc" } },
      },
    }),
    db.senderIdentity.findMany({
      where: { workspaceId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, email: true, isDefault: true },
    }),
    db.funnel.findMany({
      // Only ACTIVE funnels are valid trigger-scope targets — a trashed funnel
      // serves no pages, so its events never fire. Excludes them from the picker.
      where: { workspaceId, status: "ACTIVE" }, orderBy: { name: "asc" },
      select: {
        id: true, name: true,
        steps: { select: { id: true, name: true, type: true }, orderBy: { order: "asc" } },
      },
    }),
    db.broadcast.findMany({
      where:   { workspaceId },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
      select:  { id: true, name: true, subject: true, status: true, sentAt: true },
    }),
    db.workflowEmail.findMany({
      where:   { workflowId: id },
      orderBy: { createdAt: "asc" },
      select:  {
        id: true, name: true, subject: true, bodyHtml: true,
        fromName: true, fromEmail: true, senderId: true,
        sentCount: true, openedCount: true, clickedCount: true,
      },
    }),
    db.workflowEmail.findMany({
      where:   { workflow: { workspaceId } },
      orderBy: { createdAt: "desc" },
      select:  {
        id: true, name: true, subject: true,
        workflowId: true,
        workflow:   { select: { name: true } },
      },
    }),
  ]);

  return (
    <WorkflowBuilder
      workflow={{
        id: wf.id,
        name: wf.name,
        description: wf.description,
        status: wf.status,
        triggerType: wf.triggerType,
        triggerConfig: (wf.triggerConfig as Record<string, unknown> | null) ?? {},
        nodes: (wf.nodes as unknown as { id: string; type: any; position?: { x: number; y: number }; config?: Record<string, unknown> }[]) ?? [],
        edges: (wf.edges as unknown as { id: string; source: string; target: string; label?: string; weight?: number }[]) ?? [],
        startNodeId: wf.startNodeId,
        reFirePolicy: (wf.reFirePolicy === "once" ? "once" : "every"),
        maxDurationDays: wf.maxDurationDays,
      }}
      tags={tags}
      pipelines={pipelines}
      senders={senders}
      funnels={funnels}
      broadcasts={broadcasts}
      workflowEmails={workflowEmails}
      workspaceEmails={workspaceEmails.map((e) => ({
        id:           e.id,
        name:         e.name,
        subject:      e.subject,
        workflowId:   e.workflowId,
        workflowName: e.workflow.name,
      }))}
    />
  );
}
