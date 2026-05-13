/**
 * Workspace permission matrix.
 *
 * Role hierarchy: OWNER > ADMIN > EDITOR > VIEWER
 *
 * Usage in API routes:
 *   const access = await getWorkspaceAccess();
 *   if (!access || !can(access.role, "settings:write")) return err("Forbidden", 403);
 */

import { auth } from "./auth";
import { db } from "@launchtic/database";

export type Permission =
  | "funnels:write"
  | "contacts:write"
  | "emails:write"
  | "automations:write"
  | "orders:write"       // refund, cancel
  | "settings:read"
  | "settings:write"     // payment, smtp, storage, domains, etc.
  | "billing:manage"     // license, plan changes
  | "members:read"
  | "members:manage"     // invite, remove, change role
  | "workspace:manage";  // rename, delete workspace

// What each role is allowed to do.
const ROLE_PERMISSIONS: Record<string, Set<Permission>> = {
  OWNER: new Set([
    "funnels:write",
    "contacts:write",
    "emails:write",
    "automations:write",
    "orders:write",
    "settings:read",
    "settings:write",
    "billing:manage",
    "members:read",
    "members:manage",
    "workspace:manage",
  ]),
  ADMIN: new Set([
    "funnels:write",
    "contacts:write",
    "emails:write",
    "automations:write",
    "orders:write",
    "settings:read",
    "settings:write",
    "members:read",
    "members:manage",
  ]),
  EDITOR: new Set([
    "funnels:write",
    "contacts:write",
    "emails:write",
    "automations:write",
    "members:read",
  ]),
  VIEWER: new Set([
    "members:read",
  ]),
};

export function can(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** Returns the current user's workspace access, or null if unauthenticated. */
export async function getWorkspaceAccess(): Promise<{
  userId: string;
  workspaceId: string;
  role: string;
} | null> {
  const session = await auth();
  const userId = session?.user?.id;
  const workspaceId = (session as any)?.workspaceId;
  if (!userId || !workspaceId) return null;

  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (!member) return null;

  return { userId, workspaceId, role: member.role };
}
