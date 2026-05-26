import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
import { getRendererUrl } from "../../../../lib/system-config";
import FunnelsClient from "../../../../components/funnels/FunnelsClient";

export const metadata = { title: "Funnels" };

export default async function FunnelsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "funnels:read");
  const [total, rendererUrl] = await Promise.all([
    db.funnel.count({ where: { workspaceId, status: "ACTIVE" } }),
    getRendererUrl(),
  ]);

  return (
    <div className="flex flex-col h-full">
      <FunnelsClient initialTotal={total} rendererUrl={rendererUrl} />
    </div>
  );
}
