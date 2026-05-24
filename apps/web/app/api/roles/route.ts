import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess, ALL_PERMISSIONS } from "../../../lib/permissions";
import { getEffectivePlan } from "../../../lib/organization";
import { isPaidPlan } from "../../../lib/plan";

// GET /api/roles — list all roles in the current workspace + member count.
// Available to any workspace member (`members:read`) so the TeamPanel
// dropdown can show role choices when inviting.
export async function GET() {
  try {
    const r = await requireAccess("members:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const roles = await db.role.findMany({
      where: { workspaceId },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: "asc" },
    });

    return ok(roles.map((role) => ({
      id:          role.id,
      name:        role.name,
      description: role.description,
      permissions: role.permissions,
      memberCount: role._count.members,
      createdAt:   role.createdAt.toISOString(),
    })));
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
    const r = await requireAccess("roles:manage");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    // Plan gate. Custom roles are a paid-tier feature.
    const planRow = await db.workspace.findUnique({
      where:  { id: workspaceId },
      select: { organization: { select: { plan: true, licenseExpiresAt: true } } },
    });
    if (!isPaidPlan(getEffectivePlan(planRow?.organization))) {
      return err("Custom roles require a paid plan.", 402);
    }

    const body = createSchema.parse(await req.json());

    // Reject duplicate role name in this workspace
    const existing = await db.role.findFirst({
      where: { workspaceId, name: body.name },
      select: { id: true },
    });
    if (existing) return err("A role with this name already exists.", 409);

    const role = await db.role.create({
      data: {
        workspaceId,
        name:        body.name,
        description: body.description ?? null,
        permissions: body.permissions,
      },
      include: { _count: { select: { members: true } } },
    });

    return ok({
      id:          role.id,
      name:        role.name,
      description: role.description,
      permissions: role.permissions,
      memberCount: role._count.members,
      createdAt:   role.createdAt.toISOString(),
    }, 201);
  } catch (error) {
    return handleError(error);
  }
}
