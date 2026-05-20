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
import { redirect, notFound } from "next/navigation";
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
 * Workspace resolution: STRICTLY URL-driven via `X-Workspace-Slug` header.
 * The client `apiFetch` wrapper sets it from the current URL path
 * (`/{slug}/...`). Session no longer carries workspace state, so there's no
 * fallback — a missing header means the caller never went through apiFetch
 * (or hit /api/* outside a workspace-scoped page) and gets 401.
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

  // Resolve workspace from URL slug (header set by apiFetch). No fallback.
  const h = await headers();
  const slug = h.get("x-workspace-slug");
  if (!slug) return { ok: false, response: err("Missing workspace context", 400) };

  const ws = await db.workspace.findFirst({
    where: { slug },
    select: { id: true },
  });
  if (!ws) return { ok: false, response: err("Workspace not found", 404) };
  const workspaceId = ws.id;

  // Membership check enforces that the URL slug is actually a workspace the
  // caller is a member of — non-member callers get 401.
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

/**
 * Server-component helper: resolve workspace from the URL slug param.
 *
 *   export default async function Page({ params }) {
 *     const { workspaceSlug } = await params;
 *     const { workspaceId, userId } = await requireWorkspaceFromSlug(workspaceSlug);
 *     // ... use workspaceId in db queries
 *   }
 *
 * Replaces the legacy `session.workspaceId` reads. URL is the only source of
 * truth — multi-tab safe, share-link safe, bookmark safe.
 *
 * Redirects to /login if unauthenticated; 404s if the user isn't a member of
 * the URL workspace (parent layout already validates this, but the page is
 * defensive in case it's mounted standalone or the layout check is bypassed).
 */
export async function requireWorkspaceFromSlug(slug: string): Promise<{
  userId:        string;
  workspaceId:   string;
  workspaceSlug: string;
}> {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  if (!userId) redirect("/login");
  const ws = await db.workspace.findFirst({
    where: { slug, members: { some: { userId } } },
    select: { id: true, slug: true },
  });
  if (!ws) notFound();
  return { userId, workspaceId: ws.id, workspaceSlug: ws.slug };
}
