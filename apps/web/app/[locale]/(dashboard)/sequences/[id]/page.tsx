import { auth } from "../../../../../lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@launchtic/database";
import SequenceBuilder from "../../../../../components/sequences/SequenceBuilder";

export const metadata = { title: "Sequence" };

type PageProps = { params: Promise<{ id: string }> };

export default async function SequenceDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");
  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

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
