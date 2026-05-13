/**
 * Workspace permission matrix.
 *
 * Role hierarchy: OWNER > ADMIN > EDITOR > VIEWER
 *
 * Usage in API routes:
 *   const r = await requireAccess("settings:write");
 *   if (!r.ok) return r.response;
 *   const { workspaceId, userId } = r;
 */

import { auth } from "./auth";
import { db } from "@launchtic/database";
import { err } from "./api";

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

type Access = { ok: true; userId: string; workspaceId: string; role: string };
type Denied = { ok: false; response: ReturnType<typeof err> };

/**
 * Use in every API route handler.
 * - No permission arg → any authenticated workspace member is allowed (read-only routes).
 * - With permission arg → role must have that permission.
 *
 * Pattern:
 *   const r = await requireAccess("funnels:write");
 *   if (!r.ok) return r.response;
 *   const { workspaceId, userId } = r;
 */
export async function requireAccess(permission?: Permission): Promise<Access | Denied> {
  const session = await auth();
  const userId      = session?.user?.id;
  const workspaceId = (session as any)?.workspaceId as string | undefined;
  if (!userId || !workspaceId) return { ok: false, response: err("Unauthorized", 401) };

  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (!member) return { ok: false, response: err("Unauthorized", 401) };

  if (permission && !can(member.role, permission)) {
    return { ok: false, response: err("Forbidden", 403) };
  }

  return { ok: true, userId, workspaceId, role: member.role };
}

/** Low-level helper — use requireAccess() in routes instead. */
export async function getWorkspaceAccess(): Promise<{
  userId: string; workspaceId: string; role: string;
} | null> {
  const r = await requireAccess();
  return r.ok ? r : null;
}
