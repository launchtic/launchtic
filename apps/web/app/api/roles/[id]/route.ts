import { NextRequest } from "next/server";
import { z } from "zod";
import { updateRole, deleteRole, EeError } from "@launchtic/ee";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess, ALL_PERMISSIONS } from "../../../../lib/permissions";
import { demoGuard } from "../../../../lib/demo";

const patchSchema = z.object({
  name:        z.string().min(1).max(50).optional(),
  description: z.string().max(200).nullable().optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).optional(),
});

// PATCH /api/roles/[id] — edit role name, description, or permissions.
// Validates role belongs to this workspace and the permission list contains
// only known permissions.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("roles:manage");
    if (!r.ok) return r.response;

    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const role = await updateRole(r.workspaceId, id, body);
    return ok(role);
  } catch (error) {
    if (error instanceof EeError) return err(error.message, error.status);
    return handleError(error);
  }
}

// DELETE /api/roles/[id] — remove a role. Guardrails:
//   1. Role cannot have members — admin must reassign first
//   2. Cannot be the last role with `roles:manage` (would lock out admin UI)
// Org owner always bypasses → can recover even if guardrails are wrong.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;

    const r = await requireAccess("roles:manage");
    if (!r.ok) return r.response;

    const { id } = await params;
    const result = await deleteRole(r.workspaceId, id);
    return ok(result);
  } catch (error) {
    if (error instanceof EeError) return err(error.message, error.status);
    return handleError(error);
  }
}
