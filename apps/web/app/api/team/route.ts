import { NextRequest } from "next/server";
import { listTeamMembers, inviteTeamMember, EeError } from "@launchtic/ee";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { demoGuard } from "../../../lib/demo";

// GET /api/team — list workspace members + their role info. Includes a
// computed `isOwner` flag (true for the Organization owner — who isn't a
// "role" but always has full access).
export async function GET() {
  try {
    const r = await requireAccess("members:read");
    if (!r.ok) return r.response;
    const { workspaceId, organizationId } = r;

    const members = await listTeamMembers(workspaceId, organizationId);
    return ok(members);
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/team — invite a user (existing or new) into the workspace with
// the given role. Validates that roleId belongs to this workspace.
export async function POST(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("members:manage");
    if (!r.ok) return r.response;
    const { workspaceId, userId: callerId } = r;

    const body = await req.json();
    const member = await inviteTeamMember(workspaceId, callerId, body);
    return ok(member, 201);
  } catch (error) {
    if (error instanceof EeError) return err(error.message, error.status);
    return handleError(error);
  }
}
