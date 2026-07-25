// Team management — Agency-tier feature (FREE is capped at maxTeamMembers: 1,
// the Organization owner, via @launchtic/database's plan.ts). Invite/list/
// re-role/remove workspace members.

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, getEffectivePlan, isAgencyPlan, canInviteTeamMember } from "@launchtic/database";
import { EeError } from "./errors";

export async function listTeamMembers(workspaceId: string, organizationId: string) {
  const [members, org] = await Promise.all([
    db.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        role: { select: { id: true, name: true, permissions: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    }),
  ]);

  return members.map((m) => ({
    userId:   m.userId,
    roleId:   m.roleId,
    role:     { id: m.role.id, name: m.role.name, permissions: m.role.permissions },
    isOwner:  m.userId === org?.ownerId,
    joinedAt: m.joinedAt.toISOString(),
    user: {
      id:     m.user.id,
      name:   m.user.name,
      email:  m.user.email,
      avatar: m.user.avatar,
    },
  }));
}

const inviteSchema = z.object({
  email:  z.string().email(),
  roleId: z.string().min(1),
});

export async function inviteTeamMember(
  workspaceId: string,
  callerId: string,
  body: unknown,
) {
  const { email, roleId } = inviteSchema.parse(body);

  // Plan gate. Belt-and-suspenders against the sidebar hide: an attacker
  // hitting this endpoint directly on Free would otherwise create a
  // WorkspaceMember row that violates the 1-seat limit.
  const planRow = await db.workspace.findUnique({
    where:  { id: workspaceId },
    select: { organization: { select: { plan: true, licenseExpiresAt: true } } },
  });
  const plan = getEffectivePlan(planRow?.organization);
  if (!isAgencyPlan(plan)) {
    throw new EeError("Team management requires a paid plan. Upgrade to invite members.", 402);
  }
  const existingMembers = await db.workspaceMember.count({ where: { workspaceId } });
  // +1 for the Org owner (who has no WorkspaceMember row but counts as a seat).
  if (!canInviteTeamMember(plan, existingMembers + 1)) {
    throw new EeError("Team member limit reached for your plan. Upgrade to invite more.", 402);
  }

  // Verify role exists and belongs to this workspace
  const role = await db.role.findFirst({
    where: { id: roleId, workspaceId },
    select: { id: true, name: true, permissions: true },
  });
  if (!role) throw new EeError("Invalid role.", 400);

  // Check if email is already registered
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.id === callerId) throw new EeError("You are already a member of this workspace.", 400);
    const alreadyMember = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: existing.id } },
    });
    if (alreadyMember) throw new EeError("A user with this email is already a member of the workspace.", 409);

    const member = await db.workspaceMember.create({
      data: { workspaceId, userId: existing.id, roleId },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    return {
      userId:            member.userId,
      roleId:            member.roleId,
      role:              { id: role.id, name: role.name, permissions: role.permissions },
      isOwner:           false,
      joinedAt:          member.joinedAt.toISOString(),
      generatedPassword: null,
      user: {
        id:     member.user.id,
        name:   member.user.name,
        email:  member.user.email,
        avatar: member.user.avatar,
      },
    };
  }

  // Derive a display name from the email local part (e.g. john.doe@… → "John Doe")
  const derivedName = email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || null;

  // New user — generate a random password
  const plainPassword = randomBytes(8).toString("base64url").slice(0, 12);
  const passwordHash  = await bcrypt.hash(plainPassword, 12);

  const { member } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: derivedName, passwordHash },
    });
    const member = await tx.workspaceMember.create({
      data: { workspaceId, userId: user.id, roleId },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    return { member };
  });

  return {
    userId:            member.userId,
    roleId:            member.roleId,
    role:              { id: role.id, name: role.name, permissions: role.permissions },
    isOwner:           false,
    joinedAt:          member.joinedAt.toISOString(),
    generatedPassword: plainPassword,
    user: {
      id:     member.user.id,
      name:   member.user.name,
      email:  member.user.email,
      avatar: member.user.avatar,
    },
  };
}

const patchRoleSchema = z.object({
  roleId: z.string().min(1),
});

export async function changeMemberRole(
  workspaceId: string,
  organizationId: string,
  targetUserId: string,
  body: unknown,
) {
  const { roleId } = patchRoleSchema.parse(body);

  // Plan gate. Role-changing is a paid-tier feature; on Free there's
  // no one to re-role (owner is the only seat).
  const planRow = await db.workspace.findUnique({
    where:  { id: workspaceId },
    select: { organization: { select: { plan: true, licenseExpiresAt: true } } },
  });
  if (!isAgencyPlan(getEffectivePlan(planRow?.organization))) {
    throw new EeError("Team role management requires a paid plan.", 402);
  }

  // Org owner is protected — can't be re-roled (they bypass permissions
  // anyway via Organization.ownerId derivation).
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });
  if (org?.ownerId === targetUserId) {
    throw new EeError("The workspace owner's role cannot be changed.", 403);
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
  if (!target)  throw new EeError("Member not found.", 404);
  if (!newRole) throw new EeError("Invalid role.", 400);

  const updated = await db.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    data:  { roleId },
  });

  return {
    userId: updated.userId,
    roleId: updated.roleId,
    role:   { id: newRole.id, name: newRole.name, permissions: newRole.permissions },
  };
}

export async function removeMember(
  workspaceId: string,
  organizationId: string,
  callerId: string,
  targetUserId: string,
) {
  if (targetUserId === callerId) throw new EeError("You cannot remove yourself.", 400);

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });
  if (org?.ownerId === targetUserId) {
    throw new EeError("The workspace owner cannot be removed.", 403);
  }

  const target = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });
  if (!target) throw new EeError("Member not found.", 404);

  await db.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });

  return { removed: targetUserId };
}
