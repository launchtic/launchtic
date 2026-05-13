import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const patchSchema = z.object({
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
});

// PATCH /api/team/[userId] — change a member's role
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const r = await requireAccess("members:manage");
    if (!r.ok) return r.response;
    const { workspaceId, role: callerRole } = r;

    const { userId: targetUserId } = await params;
    const { role } = patchSchema.parse(await req.json());

    const target = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!target) return err("Member not found.", 404);
    if (target.role === "OWNER") return err("The workspace owner's role cannot be changed.", 403);
    if (callerRole === "ADMIN" && target.role === "ADMIN") {
      return err("Admins cannot change another admin's role.", 403);
    }

    const updated = await db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
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
    const r = await requireAccess("members:manage");
    if (!r.ok) return r.response;
    const { workspaceId, userId: callerId, role: callerRole } = r;

    const { userId: targetUserId } = await params;
    if (targetUserId === callerId) return err("You cannot remove yourself.", 400);

    const target = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!target) return err("Member not found.", 404);
    if (target.role === "OWNER") return err("The workspace owner cannot be removed.", 403);
    if (callerRole === "ADMIN" && target.role === "ADMIN") {
      return err("Admins cannot remove another admin.", 403);
    }

    await db.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });

    return ok({ removed: targetUserId });
  } catch (error) {
    return handleError(error);
  }
}
