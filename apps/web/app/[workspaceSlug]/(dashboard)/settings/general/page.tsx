import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import GeneralPanel from "../../../../../components/settings/GeneralPanel";

export const metadata = { title: "General" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "settings:general:read");

  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, slug: true },
  });

  return (
    <div className="p-6 sm:p-8">
      <GeneralPanel
        workspaceId={workspaceId}
        workspaceName={ws?.name ?? ""}
        workspaceSlug={ws?.slug ?? workspaceSlug}
      />
    </div>
  );
}
