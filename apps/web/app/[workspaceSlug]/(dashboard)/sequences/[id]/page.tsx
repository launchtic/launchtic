import { notFound } from "next/navigation";
import { db } from "@launchtic/database";
import SequenceBuilder from "../../../../../components/sequences/SequenceBuilder";

import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
export const metadata = { title: "Sequence" };

type PageProps = { params: Promise<{ id: string; workspaceSlug: string }> };

export default async function SequenceDetailPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "sequences:read");

  const { id } = await params;
  const [sequence, templates, senderIdentities] = await Promise.all([
    db.emailSequence.findFirst({
      where: { id, workspaceId },
      include: { steps: { orderBy: { order: "asc" } } },
    }),
    db.emailTemplate.findMany({
      where: { workspaceId },
      orderBy: [{ isSystem: "desc" }, { updatedAt: "desc" }],
      select: { id: true, name: true, subject: true, htmlBody: true, category: true },
    }),
    db.senderIdentity.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, email: true, isDefault: true },
    }),
  ]);
  if (!sequence) notFound();

  return (
    <SequenceBuilder
      initial={{
        id: sequence.id,
        name: sequence.name,
        status: sequence.status,
        totalEnrolled: sequence.totalEnrolled,
        activeCount: sequence.activeCount,
        completedCount: sequence.completedCount,
        exitedCount: sequence.exitedCount,
        steps: sequence.steps.map((s) => ({
          id: s.id,
          order: s.order,
          delayMinutes: s.delayMinutes,
          emailTemplateId: s.emailTemplateId,
          emailSubject: s.emailSubject,
          emailHtmlBody: s.emailHtmlBody,
          emailFromName: s.emailFromName,
          emailFromEmail: s.emailFromEmail,
        })),
      }}
      templates={templates}
      senderIdentities={senderIdentities}
    />
  );
}
