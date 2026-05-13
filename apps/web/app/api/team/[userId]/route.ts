import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { getWorkspaceAccess, can } from "../../../../lib/permissions";

const patchSchema = z.object({
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
});

// PATCH /api/team/[userId] — change a member's role
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const access = await getWorkspaceAccess();
    if (!access) return err("Unauthorized", 401);
    if (!can(access.role, "members:manage")) return err("Forbidden", 403);

    const { userId: targetUserId } = await params;
    const body = await req.json();
    const { role } = patchSchema.parse(body);

    // Find the target member
    const target = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: access.workspaceId, userId: targetUserId } },
    });
    if (!target) return err("Member not found.", 404);

    // Cannot change the OWNER's role
    if (target.role === "OWNER") return err("The workspace owner's role cannot be changed.", 403);

    // ADMIN can only manage EDITOR/VIEWER (not other ADMINs)
    if (access.role === "ADMIN" && target.role === "ADMIN") {
      return err("Admins cannot change another admin's role.", 403);
    }

    const updated = await db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: access.workspaceId, userId: targetUserId } },
      data: { role },
    });

    return ok({ userId: updated.userId, role: updated.role });
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/team/[userId] — remove a member
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const access = await getWorkspaceAccess();
    if (!access) return err("Unauthorized", 401);
    if (!can(access.role, "members:manage")) return err("Forbidden", 403);

    const { userId: targetUserId } = await params;

    // Cannot remove yourself
    if (targetUserId === access.userId) return err("You cannot remove yourself.", 400);

    const target = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: access.workspaceId, userId: targetUserId } },
    });
    if (!target) return err("Member not found.", 404);

    // Cannot remove the OWNER
    if (target.role === "OWNER") return err("The workspace owner cannot be removed.", 403);

    // ADMIN cannot remove other ADMINs
    if (access.role === "ADMIN" && target.role === "ADMIN") {
      return err("Admins cannot remove another admin.", 403);
    }

    await db.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: access.workspaceId, userId: targetUserId } },
    });

    return ok({ removed: targetUserId });
  } catch (error) {
    return handleError(error);
  }
}
