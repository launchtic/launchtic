// Custom roles & permissions — Agency-tier feature (FREE workspaces only have
// the seed owner role, via @launchtic/database's plan.ts `teamRoles` flag).
//
// Permission-key validation against the app's ALL_PERMISSIONS catalog is done
// by the caller (apps/web/lib/permissions.ts is core RBAC infra, not an
// Agency-exclusive concern) — these functions receive an already-validated
// `permissions: string[]` and only handle the plan gate + role CRUD.

import { db, getEffectivePlan, isAgencyPlan } from "@launchtic/database";
import { EeError } from "./errors";

export async function listRoles(workspaceId: string) {
  const roles = await db.role.findMany({
    where: { workspaceId },
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: "asc" },
  });

  return roles.map((role) => ({
    id:          role.id,
    name:        role.name,
    description: role.description,
    permissions: role.permissions,
    memberCount: role._count.members,
    createdAt:   role.createdAt.toISOString(),
  }));
}

async function assertAgencyPlan(workspaceId: string, deniedMessage: string) {
  const planRow = await db.workspace.findUnique({
    where:  { id: workspaceId },
    select: { organization: { select: { plan: true, licenseExpiresAt: true } } },
  });
  if (!isAgencyPlan(getEffectivePlan(planRow?.organization))) {
    throw new EeError(deniedMessage, 402);
  }
}

export async function createRole(
  workspaceId: string,
  input: { name: string; description?: string; permissions: string[] },
) {
  await assertAgencyPlan(workspaceId, "Custom roles require a paid plan.");

  // Reject duplicate role name in this workspace
  const existing = await db.role.findFirst({
    where: { workspaceId, name: input.name },
    select: { id: true },
  });
  if (existing) throw new EeError("A role with this name already exists.", 409);

  const role = await db.role.create({
    data: {
      workspaceId,
      name:        input.name,
      description: input.description ?? null,
      permissions: input.permissions,
    },
    include: { _count: { select: { members: true } } },
  });

  return {
    id:          role.id,
    name:        role.name,
    description: role.description,
    permissions: role.permissions,
    memberCount: role._count.members,
    createdAt:   role.createdAt.toISOString(),
  };
}

export async function updateRole(
  workspaceId: string,
  roleId: string,
  patch: { name?: string; description?: string | null; permissions?: string[] },
) {
  // Editing custom roles requires a paid tier (Free has only seed roles
  // which aren't editable anyway, but defense-in-depth).
  await assertAgencyPlan(workspaceId, "Custom roles require a paid plan.");

  const role = await db.role.findFirst({
    where: { id: roleId, workspaceId },
    select: { id: true, name: true, permissions: true },
  });
  if (!role) throw new EeError("Role not found.", 404);

  // Reject duplicate name (if renaming)
  if (patch.name && patch.name !== role.name) {
    const dup = await db.role.findFirst({
      where: { workspaceId, name: patch.name, NOT: { id: roleId } },
      select: { id: true },
    });
    if (dup) throw new EeError("A role with this name already exists.", 409);
  }

  // Guardrail: prevent removing `roles:manage` from the last role that has
  // it (would lock the workspace out of role management; only Org owner
  // could recover). Only relevant when this role CURRENTLY holds it and the
  // update drops it — editing a role that never had it can't reduce the count.
  if (
    role.permissions.includes("roles:manage") &&
    patch.permissions &&
    !patch.permissions.includes("roles:manage")
  ) {
    const others = await db.role.count({
      where: {
        workspaceId,
        permissions: { has: "roles:manage" },
        NOT: { id: roleId },
      },
    });
    if (others === 0) {
      throw new EeError(
        "Cannot remove 'Manage roles' from the last role that has it. Grant the permission to another role first.",
        400,
      );
    }
  }

  const updated = await db.role.update({
    where: { id: roleId },
    data: {
      ...(patch.name        !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.permissions !== undefined && { permissions: patch.permissions }),
    },
    include: { _count: { select: { members: true } } },
  });

  return {
    id:          updated.id,
    name:        updated.name,
    description: updated.description,
    permissions: updated.permissions,
    memberCount: updated._count.members,
  };
}

// DELETE has no plan gate — a downgraded org should still be able to clean
// up roles it can no longer create new ones of.
export async function deleteRole(workspaceId: string, roleId: string) {
  const role = await db.role.findFirst({
    where: { id: roleId, workspaceId },
    include: { _count: { select: { members: true } } },
  });
  if (!role) throw new EeError("Role not found.", 404);

  if (role._count.members > 0) {
    throw new EeError(
      `Cannot delete: ${role._count.members} member(s) are assigned this role. Reassign them first.`,
      400,
    );
  }

  if (role.permissions.includes("roles:manage")) {
    const others = await db.role.count({
      where: {
        workspaceId,
        permissions: { has: "roles:manage" },
        NOT: { id: roleId },
      },
    });
    if (others === 0) {
      throw new EeError("Cannot delete the last role with 'Manage roles' permission.", 400);
    }
  }

  await db.role.delete({ where: { id: roleId } });

  return { deleted: roleId };
}
