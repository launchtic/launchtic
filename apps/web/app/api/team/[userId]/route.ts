import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getEffectivePlan } from "../../../../lib/organization";
import { isPaidPlan } from "../../../../lib/plan";

const patchSchema = z.object({
  roleId: z.string().min(1),
});

// PATCH /api/team/[userId] — change a member's role. The Organization owner
// (founder) cannot be demoted via this endpoint — ownership transfer goes
// through a separate flow. Non-owners with `members:manage` can change
// anyone else's role; the lateral-attack protection (admin can't demote
// admin) used to live here, but with custom roles it doesn't generalize —
// keep that policy at the UI layer and rely on Org owner as last resort.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const r = await requireAccess("members:manage");
    if (!r.ok) return r.response;
    const { workspaceId, organizationId } = r;

    // Plan gate. Role-changing is a paid-tier feature; on Community there's
    // no one to re-role (owner is the only seat).
    const planRow = await db.workspace.findUnique({
      where:  { id: workspaceId },
      select: { organization: { select: { plan: true, licenseExpiresAt: true } } },
    });
    if (!isPaidPlan(getEffectivePlan(planRow?.organization))) {
      return err("Team role management requires a paid plan.", 402);
    }

    const { userId: targetUserId } = await params;
    const { roleId } = patchSchema.parse(await req.json());

    // Org owner is protected — can't be re-roled (they bypass permissions
    // anyway via Organization.ownerId derivation).
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    if (org?.ownerId === targetUserId) {
      return err("The workspace owner's role cannot be changed.", 403);
    }

    // Validate target membership + new roleId both belong to this workspace.
    const [target, newRole] = await Promise.all([
      db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      }),
      db.role.findFirst({
        where: { id: roleId, workspaceId },
        select: { id: true, name: true, permissions: true },
      }),
    ]);
    if (!target)  return err("Member not found.", 404);
    if (!newRole) return err("Invalid role.", 400);

    const updated = await db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data:  { roleId },
    });

    return ok({
      userId: updated.userId,
      roleId: updated.roleId,
      role:   { id: newRole.id, name: newRole.name, permissions: newRole.permissions },
    });
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/team/[userId] — remove a member from the workspace. The Org
// owner cannot be removed via this endpoint (they own the workspace).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const r = await requireAccess("members:manage");
    if (!r.ok) return r.response;
    const { workspaceId, userId: callerId, organizationId } = r;

    const { userId: targetUserId } = await params;
    if (targetUserId === callerId) return err("You cannot remove yourself.", 400);

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    if (org?.ownerId === targetUserId) {
      return err("The workspace owner cannot be removed.", 403);
    }

    const target = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!target) return err("Member not found.", 404);

    await db.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });

    return ok({ removed: targetUserId });
  } catch (error) {
    return handleError(error);
  }
}
