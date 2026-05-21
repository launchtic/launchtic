import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import { getEffectivePlan } from "../../../../../lib/organization";
import WorkspacePanel from "../../../../../components/settings/WorkspacePanel";

export const metadata = { title: "Workspaces" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  // Workspaces tab is OWNER-only — it surfaces create/rename/delete actions
  // on the workspaces under this Organization. Regular members switch
  // between their workspaces via the TopNav WorkspaceSwitcher chip; they
  // don't need this management view. `workspace:manage` is granted only to
  // the Organization owner via the requireAccess bypass.
  const { workspaceId, userId } = await requireWorkspaceFromSlug(workspaceSlug, "workspace:manage");

  const [workspaces, ws] = await Promise.all([
    db.workspace.findMany({
      where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      select: {
        id: true, name: true, slug: true, ownerId: true,
        members: {
          where: { userId },
          select: { role: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: { organization: { select: { plan: true, licenseExpiresAt: true } } },
    }),
  ]);

  const workspacePlan = getEffectivePlan(ws?.organization);

  return (
    <div className="p-6 sm:p-8">
      <WorkspacePanel
        currentWorkspaceId={workspaceId}
        currentWorkspaceSlug={workspaceSlug}
        workspacePlan={workspacePlan}
        userId={userId}
        workspaces={workspaces.map((w) => ({
          ...w,
          userRole: w.ownerId === userId ? "OWNER" : (w.members[0]?.role?.name ?? "Viewer"),
        }))}
      />
    </div>
  );
}
