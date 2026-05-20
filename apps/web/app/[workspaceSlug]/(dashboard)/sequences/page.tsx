import { db } from "@launchtic/database";
import SequencesList from "../../../../components/sequences/SequencesList";

import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
export const metadata = { title: "Sequences" };

export default async function SequencesPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug);

  const sequences = await db.emailSequence.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      totalEnrolled: true,
      activeCount: true,
      completedCount: true,
      exitedCount: true,
      _count: { select: { steps: true } },
    },
  });

  return (
    <SequencesList
      initial={sequences.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        totalEnrolled: s.totalEnrolled,
        activeCount: s.activeCount,
        completedCount: s.completedCount,
        exitedCount: s.exitedCount,
        stepCount: s._count.steps,
      }))}
    />
  );
}
