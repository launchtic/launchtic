import { NextRequest } from "next/server";
import { z } from "zod";
import { listRoles, createRole, EeError } from "@launchtic/ee";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess, ALL_PERMISSIONS } from "../../../lib/permissions";
import { demoGuard } from "../../../lib/demo";

// GET /api/roles — list all roles in the current workspace + member count.
// Available to any workspace member (`members:read`) so the TeamPanel
// dropdown can show role choices when inviting.
export async function GET() {
  try {
    const r = await requireAccess("members:read");
    if (!r.ok) return r.response;
    const roles = await listRoles(r.workspaceId);
    return ok(roles);
  } catch (error) {
    return handleError(error);
  }
}

const createSchema = z.object({
  name:        z.string().min(1).max(50),
  description: z.string().max(200).optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).default([]),
});

// POST /api/roles — create a new custom role. Validates that every requested
// permission is in the known catalog so admins can't grant non-existent
// permissions or typos.
export async function POST(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("roles:manage");
    if (!r.ok) return r.response;

    const body = createSchema.parse(await req.json());
    const role = await createRole(r.workspaceId, body);
    return ok(role, 201);
  } catch (error) {
    if (error instanceof EeError) return err(error.message, error.status);
    return handleError(error);
  }
}
