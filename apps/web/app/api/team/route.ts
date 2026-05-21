import { NextRequest } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";

// GET /api/team — list workspace members + their role info. Includes a
// computed `isOwner` flag (true for the Organization owner — who isn't a
// "role" but always has full access).
export async function GET() {
  try {
    const r = await requireAccess("members:read");
    if (!r.ok) return r.response;
    const { workspaceId, organizationId } = r;

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

    return ok(members.map((m) => ({
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
    })));
  } catch (error) {
    return handleError(error);
  }
}

const inviteSchema = z.object({
  email:  z.string().email(),
  roleId: z.string().min(1),
});

// POST /api/team — invite a user (existing or new) into the workspace with
// the given role. Validates that roleId belongs to this workspace.
export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("members:manage");
    if (!r.ok) return r.response;
    const { workspaceId, userId: callerId } = r;

    const body = await req.json();
    const { email, roleId } = inviteSchema.parse(body);

    // Verify role exists and belongs to this workspace
    const role = await db.role.findFirst({
      where: { id: roleId, workspaceId },
      select: { id: true, name: true, permissions: true },
    });
    if (!role) return err("Invalid role.", 400);

    // Check if email is already registered
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.id === callerId) return err("You are already a member of this workspace.", 400);
      const alreadyMember = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existing.id } },
      });
      if (alreadyMember) return err("A user with this email is already a member of the workspace.", 409);

      const member = await db.workspaceMember.create({
        data: { workspaceId, userId: existing.id, roleId },
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
      });
      return ok({
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
      }, 201);
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

    return ok({
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
    }, 201);
  } catch (error) {
    return handleError(error);
  }
}
