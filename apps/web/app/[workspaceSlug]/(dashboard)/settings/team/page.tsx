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

  // Owner doesn't have a WorkspaceMember row (they bypass via Organization.ownerId).
  // Fetch their User profile separately so TeamPanel can render the "Owner"
  // row at the top of the member list.
  const workspaceWithOrg = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      organization: {
        select: {
          ownerId: true,
          owner: { select: { id: true, name: true, email: true, avatar: true } },
        },
      },
    },
  });
  const orgOwnerId = workspaceWithOrg?.organization?.ownerId ?? null;
  const ownerUser  = workspaceWithOrg?.organization?.owner ?? null;

  const teamMembers = await db.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
      role: { select: { id: true, name: true, permissions: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  return (
    <div className="p-6 sm:p-8">
      <TeamPanel
        ownerInfo={ownerUser ? {
          userId: ownerUser.id,
          name:   ownerUser.name,
          email:  ownerUser.email,
          avatar: ownerUser.avatar,
        } : null}
        initialMembers={teamMembers
          // Defensive: skip Owner if they happen to also have a WorkspaceMember
          // row (legacy data). Otherwise they'd render twice.
          .filter((m) => m.userId !== orgOwnerId)
          .map((m) => ({
            userId:   m.userId,
            roleId:   m.roleId,
            role:     { id: m.role.id, name: m.role.name, permissions: m.role.permissions },
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
