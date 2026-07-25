import { NextRequest } from "next/server";
import { changeMemberRole, removeMember, EeError } from "@launchtic/ee";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { demoGuard } from "../../../../lib/demo";

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
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("members:manage");
    if (!r.ok) return r.response;
    const { workspaceId, organizationId } = r;

    const { userId: targetUserId } = await params;
    const body = await req.json();
    const updated = await changeMemberRole(workspaceId, organizationId, targetUserId, body);
    return ok(updated);
  } catch (error) {
    if (error instanceof EeError) return err(error.message, error.status);
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
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("members:manage");
    if (!r.ok) return r.response;
    const { workspaceId, userId: callerId, organizationId } = r;

    const { userId: targetUserId } = await params;
    const result = await removeMember(workspaceId, organizationId, callerId, targetUserId);
    return ok(result);
  } catch (error) {
    if (error instanceof EeError) return err(error.message, error.status);
    return handleError(error);
  }
}
