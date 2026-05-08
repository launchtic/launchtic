import { auth } from "../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import SequencesList from "../../../../components/sequences/SequencesList";

export const metadata = { title: "Sequences" };

export default async function SequencesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

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
