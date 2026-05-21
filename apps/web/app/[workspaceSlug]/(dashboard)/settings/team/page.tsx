import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import TeamPanel from "../../../../../components/settings/TeamPanel";

export const metadata = { title: "Team" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspaceId, userId, isOwner, role } = await requireWorkspaceFromSlug(
    workspaceSlug,
    "members:read",
  );

  const [teamMembers, organization] = await Promise.all([
    db.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        role: { select: { id: true, name: true, permissions: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: { organization: { select: { ownerId: true } } },
    }),
  ]);

  const orgOwnerId = organization?.organization?.ownerId ?? null;

  return (
    <div className="p-6 sm:p-8">
      <TeamPanel
        initialMembers={teamMembers.map((m) => ({
          userId:   m.userId,
          roleId:   m.roleId,
          role:     { id: m.role.id, name: m.role.name, permissions: m.role.permissions },
          isOwner:  m.userId === orgOwnerId,
          joinedAt: m.joinedAt.toISOString(),
          user: {
            id:     m.user.id,
            name:   m.user.name,
            email:  m.user.email,
            avatar: m.user.avatar,
          },
        }))}
        currentUserId={userId}
        currentUserRole={role}
        isOwner={isOwner}
      />
    </div>
  );
}
