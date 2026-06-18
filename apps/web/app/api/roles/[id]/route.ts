import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess, ALL_PERMISSIONS } from "../../../../lib/permissions";
import { demoGuard } from "../../../../lib/demo";
import { getEffectivePlan } from "../../../../lib/organization";
import { isPaidPlan } from "../../../../lib/plan";

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
    const { workspaceId } = r;

    // Plan gate. Editing custom roles requires a paid tier (Community has
    // only seed roles which aren't editable anyway, but defense-in-depth).
    const planRow = await db.workspace.findUnique({
      where:  { id: workspaceId },
      select: { organization: { select: { plan: true, licenseExpiresAt: true } } },
    });
    if (!isPaidPlan(getEffectivePlan(planRow?.organization))) {
      return err("Custom roles require a paid plan.", 402);
    }

    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const role = await db.role.findFirst({
      where: { id, workspaceId },
      select: { id: true, name: true, permissions: true },
    });
    if (!role) return err("Role not found.", 404);

    // Reject duplicate name (if renaming)
    if (body.name && body.name !== role.name) {
      const dup = await db.role.findFirst({
        where: { workspaceId, name: body.name, NOT: { id } },
        select: { id: true },
      });
      if (dup) return err("A role with this name already exists.", 409);
    }

    // Guardrail: prevent removing `roles:manage` from the last role that has
    // it (would lock the workspace out of role management; only Org owner
    // could recover). Only relevant when this role CURRENTLY holds it and the
    // update drops it — editing a role that never had it can't reduce the count.
    if (
      role.permissions.includes("roles:manage") &&
      body.permissions &&
      !body.permissions.includes("roles:manage")
    ) {
      const others = await db.role.count({
        where: {
          workspaceId,
          permissions: { has: "roles:manage" },
          NOT: { id },
        },
      });
      if (others === 0) {
        return err(
          "Cannot remove 'Manage roles' from the last role that has it. Grant the permission to another role first.",
          400,
        );
      }
    }

    const updated = await db.role.update({
      where: { id },
      data: {
        ...(body.name        !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.permissions !== undefined && { permissions: body.permissions }),
      },
      include: { _count: { select: { members: true } } },
    });

    return ok({
      id:          updated.id,
      name:        updated.name,
      description: updated.description,
      permissions: updated.permissions,
      memberCount: updated._count.members,
    });
  } catch (error) {
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
    const { workspaceId } = r;

    const { id } = await params;

    const role = await db.role.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { members: true } } },
    });
    if (!role) return err("Role not found.", 404);

    if (role._count.members > 0) {
      return err(
        `Cannot delete: ${role._count.members} member(s) are assigned this role. Reassign them first.`,
        400,
      );
    }

    if (role.permissions.includes("roles:manage")) {
      const others = await db.role.count({
        where: {
          workspaceId,
          permissions: { has: "roles:manage" },
          NOT: { id },
        },
      });
      if (others === 0) {
        return err(
          "Cannot delete the last role with 'Manage roles' permission.",
          400,
        );
      }
    }

    await db.role.delete({ where: { id } });

    return ok({ deleted: id });
  } catch (error) {
    return handleError(error);
  }
}
