import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
import FunnelsClient from "../../../../components/funnels/FunnelsClient";

export const metadata = { title: "Funnels" };

export default async function FunnelsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug);
  const total = await db.funnel.count({ where: { workspaceId, status: "ACTIVE" } });

  return (
    <div className="flex flex-col h-full">
      <FunnelsClient initialTotal={total} rendererUrl={process.env.RENDERER_URL!} />
    </div>
  );
}
