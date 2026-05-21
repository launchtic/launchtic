import { notFound } from "next/navigation";
import { db } from "@launchtic/database";
import AutomationBuilder from "../../../../../components/automations/AutomationBuilder";

import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
export const metadata = { title: "Automation" };

type PageProps = { params: Promise<{ id: string; workspaceSlug: string }> };

export default async function AutomationDetailPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "automations:read");

  const { id } = await params;
  const [automation, tags, templates, funnels, sequences, senderIdentities] = await Promise.all([
    db.automation.findFirst({
      where: { id, workspaceId },
      include: { actions: { orderBy: { order: "asc" } } },
    }),
    db.tag.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    db.emailTemplate.findMany({
      where: { workspaceId },
      orderBy: [{ isSystem: "desc" }, { updatedAt: "desc" }],
      select: { id: true, name: true, subject: true, htmlBody: true, category: true },
    }),
    db.funnel.findMany({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        steps: {
          orderBy: { order: "asc" },
          select: { id: true, name: true, type: true },
        },
      },
    }),
    db.emailSequence.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
    }),
    db.senderIdentity.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, email: true, isDefault: true },
    }),
  ]);
  if (!automation) notFound();

  return (
    <AutomationBuilder
      initial={{
        id: automation.id,
        name: automation.name,
        status: automation.status,
        triggerType: automation.triggerType,
        triggerConfig: automation.triggerConfig as Record<string, unknown>,
        timesTriggered: automation.timesTriggered,
        lastTriggeredAt: automation.lastTriggeredAt?.toISOString() ?? null,
        actions: automation.actions.map((a) => ({
          id: a.id,
          order: a.order,
          actionType: a.actionType,
          actionConfig: a.actionConfig as Record<string, unknown>,
          emailTemplateId: a.emailTemplateId,
          emailSubject: a.emailSubject,
          emailHtmlBody: a.emailHtmlBody,
          emailFromName: a.emailFromName,
          emailFromEmail: a.emailFromEmail,
        })),
      }}
      tags={tags}
      templates={templates}
      funnels={funnels}
      sequences={sequences}
      senderIdentities={senderIdentities}
    />
  );
}
