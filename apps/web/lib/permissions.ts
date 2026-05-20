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
import { headers } from "next/headers";
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
 * Workspace resolution (URL-driven, industry standard):
 *   1. Read `x-workspace-slug` header — set by the client `apiFetch` wrapper
 *      from the current URL path (`/{slug}/...`). This is the source of truth
 *      when the user is browsing a workspace, regardless of which workspace
 *      their session previously "selected".
 *   2. Validate the user is a member of that workspace; resolve to workspaceId.
 *   3. Fallback: session.workspaceId. Used by callers that aren't request-
 *      scoped (background jobs, scripts) or legacy fetch calls that haven't
 *      migrated to apiFetch yet. Backward compatible — nothing breaks.
 *
 * Pattern (unchanged):
 *   const r = await requireAccess("funnels:write");
 *   if (!r.ok) return r.response;
 *   const { workspaceId, userId } = r;
 */
export async function requireAccess(permission?: Permission): Promise<Access | Denied> {
  const session = await auth();
  const userId  = session?.user?.id;
  if (!userId) return { ok: false, response: err("Unauthorized", 401) };

  // 1. Prefer URL-driven slug from header
  let workspaceId: string | undefined;
  try {
    const h = await headers();
    const slug = h.get("x-workspace-slug");
    if (slug) {
      const ws = await db.workspace.findFirst({
        where: { slug },
        select: { id: true },
      });
      // Slug points at a non-existent workspace OR caller is spoofing — reject
      // even before membership check (membership check below would 401 anyway,
      // but explicit 404 here is the honest signal).
      if (!ws) return { ok: false, response: err("Workspace not found", 404) };
      workspaceId = ws.id;
    }
  } catch {
    // headers() throws when called outside a request scope (e.g. background
    // worker) — silently fall through to session-based resolution.
  }

  // 2. Fallback to session
  if (!workspaceId) {
    workspaceId = (session as any)?.workspaceId as string | undefined;
  }
  if (!workspaceId) return { ok: false, response: err("Unauthorized", 401) };

  // 3. Membership check (also enforces that the URL-supplied workspace
  // is actually one the user belongs to — non-member callers get 401).
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
