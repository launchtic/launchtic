/**
 * Workspace permission matrix.
 *
 * Role system:
 *   - OWNER  = derived from Organization.ownerId (NOT a role row).
 *              Bypasses every permission check via the shortcut in
 *              requireAccess() — founder always has full access.
 *   - Other  = WorkspaceMember.role (FK to Role table). Role rows hold an
 *              explicit permission list — checks read `role.permissions`
 *              directly, no hard-coded matrix.
 *
 * Default roles seeded per workspace: Admin / Marketer / Designer / Viewer
 * (see lib/seed-roles.ts). Admins can edit/delete/create custom roles via
 * /api/roles.
 *
 * Permission naming:
 *   - <resource>:<verb>   e.g. funnels:read, contacts:write, orders:refund
 *   - settings:<sub>:<verb> e.g. settings:payment:write
 *
 * Verbs:
 *   - read    — list / view detail
 *   - write   — create + edit (combined since rarely separated in practice)
 *   - delete  — destructive removal (separate to allow "edit but not delete")
 *   - special action — refund, send, cancel, import, export, resend, upload
 *
 * Usage in API routes:
 *   const r = await requireAccess("funnels:write");
 *   if (!r.ok) return r.response;
 *   const { workspaceId, userId } = r;
 */

import { auth } from "./auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { db } from "@launchtic/database";
import { err } from "./api";

export type Permission =
  // ── Funnels & Pages (includes steps, plans, bumps, domains, saved blocks) ──
  | "funnels:read"
  | "funnels:write"
  | "funnels:delete"

  // ── Sales: Physical Products ──
  | "products:read"
  | "products:write"
  | "products:delete"

  // ── Sales: Orders ──
  | "orders:read"
  | "orders:refund"          // refund + cancel order (irreversible financial)

  // ── Sales: Subscriptions ──
  | "subscriptions:read"
  | "subscriptions:cancel"   // cancel + resume

  // ── Sales: Transactions ──
  | "transactions:read"      // immutable audit log

  // ── Sales: Coupons ──
  | "coupons:read"
  | "coupons:write"
  | "coupons:delete"

  // ── Contacts ──
  | "contacts:read"
  | "contacts:write"
  | "contacts:delete"
  | "contacts:import"        // bulk CSV import (data quality)
  | "contacts:export"        // GDPR-sensitive PII export

  // ── Tags ──
  | "tags:read"
  | "tags:write"
  | "tags:delete"

  // ── Emails: Broadcasts ──
  | "broadcasts:read"
  | "broadcasts:write"       // create + edit drafts
  | "broadcasts:send"        // actually send to recipients (irreversible)
  | "broadcasts:delete"

  // ── Emails: Sequences (drip campaigns) ──
  | "sequences:read"
  | "sequences:write"        // create + edit + enroll/exit contacts
  | "sequences:delete"

  // ── Emails: Templates ──
  | "email_templates:read"
  | "email_templates:write"
  | "email_templates:delete"

  // ── Emails: Logs ──
  | "email_logs:read"
  | "email_logs:resend"      // retry failed sends + clear log

  // ── Automations ──
  | "automations:read"
  | "automations:write"
  | "automations:delete"

  // ── Media ──
  | "media:read"
  | "media:upload"
  | "media:delete"

  // ── AI Assistant USE (separate from settings:ai:* which gates the config) ──
  // Workspace-wide gate for chatting with the assistant. Admins grant this
  // to roles that should be able to talk to the AI; revoking it hides the
  // floating chat chip and blocks /api/ai/chat. Per-tool authority is still
  // enforced individually (e.g. `funnels:write` to actually create a funnel).
  | "ai:use"

  // ── Settings: General (workspace name, defaults) ──
  | "settings:general:read"
  | "settings:general:write"

  // ── Settings: Custom Domains ──
  | "settings:domains:read"
  | "settings:domains:write"

  // ── Settings: Payment (Stripe/PayPal credentials) 🔴 ──
  | "settings:payment:read"
  | "settings:payment:write"

  // ── Settings: Email (SMTP creds + sender identities + footer) 🔴 ──
  | "settings:email:read"
  | "settings:email:write"

  // ── Settings: Storage (S3 keys + bucket config) 🔴 ──
  | "settings:storage:read"
  | "settings:storage:write"

  // ── Settings: Page Templates ──
  | "settings:page_templates:read"
  | "settings:page_templates:write"

  // ── Settings: AI Assistant (BYOK key) 🔴 ──
  | "settings:ai:read"
  | "settings:ai:write"

  // ── Team / Roles ──
  | "members:read"
  | "members:manage"         // invite, remove, change role
  | "roles:read"
  | "roles:manage"           // CRUD custom roles

  // ── OWNER-only (granted only via Organization.ownerId bypass) 👑 ──
  | "billing:manage"         // activate license, view billing
  | "workspace:manage";      // rename, delete workspace

/** All permissions — used to fill in the bypass return for organization owner. */
export const ALL_PERMISSIONS: Permission[] = [
  "ai:use",
  "funnels:read", "funnels:write", "funnels:delete",
  "products:read", "products:write", "products:delete",
  "orders:read", "orders:refund",
  "subscriptions:read", "subscriptions:cancel",
  "transactions:read",
  "coupons:read", "coupons:write", "coupons:delete",
  "contacts:read", "contacts:write", "contacts:delete", "contacts:import", "contacts:export",
  "tags:read", "tags:write", "tags:delete",
  "broadcasts:read", "broadcasts:write", "broadcasts:send", "broadcasts:delete",
  "sequences:read", "sequences:write", "sequences:delete",
  "email_templates:read", "email_templates:write", "email_templates:delete",
  "email_logs:read", "email_logs:resend",
  "automations:read", "automations:write", "automations:delete",
  "media:read", "media:upload", "media:delete",
  "settings:general:read", "settings:general:write",
  "settings:domains:read", "settings:domains:write",
  "settings:payment:read", "settings:payment:write",
  "settings:email:read", "settings:email:write",
  "settings:storage:read", "settings:storage:write",
  "settings:page_templates:read", "settings:page_templates:write",
  "settings:ai:read", "settings:ai:write",
  "members:read", "members:manage",
  "roles:read", "roles:manage",
  "billing:manage", "workspace:manage",
];

/** Check whether a permission list grants the given permission. */
export function can(permissions: readonly string[], permission: Permission): boolean {
  return permissions.includes(permission);
}

type Access = {
  ok: true;
  userId: string;
  workspaceId: string;
  organizationId: string;
  /** Role name e.g. "Admin", "Marketer", or "OWNER" for the founder. */
  role: string;
  /** Effective permission list (full set when isOwner). */
  permissions: readonly string[];
  /** True if user is the Organization.ownerId — bypassed every check. */
  isOwner: boolean;
};
type Denied = { ok: false; response: ReturnType<typeof err> };

/**
 * Use in every API route handler.
 * - No permission arg → any authenticated workspace member is allowed.
 * - With permission arg → role.permissions must include it (or user is OWNER).
 *
 * Workspace resolution: STRICTLY URL-driven via X-Workspace-Slug header.
 * The client apiFetch wrapper sets it from the current URL path. Session no
 * longer carries workspace state, so missing header = 400.
 */
export async function requireAccess(permission?: Permission): Promise<Access | Denied> {
  const session = await auth();
  const userId  = session?.user?.id;
  if (!userId) return { ok: false, response: err("Unauthorized", 401) };

  const h = await headers();
  const slug = h.get("x-workspace-slug");
  if (!slug) return { ok: false, response: err("Missing workspace context", 400) };

  const ws = await db.workspace.findFirst({
    where: { slug },
    select: {
      id: true,
      organizationId: true,
      organization: { select: { ownerId: true } },
      members: {
        where: { userId },
        select: { role: { select: { name: true, permissions: true } } },
        take: 1,
      },
    },
  });
  if (!ws) return { ok: false, response: err("Workspace not found", 404) };

  const isOwner = ws.organization.ownerId === userId;

  if (isOwner) {
    return {
      ok: true,
      userId,
      workspaceId:    ws.id,
      organizationId: ws.organizationId,
      role:           "OWNER",
      permissions:    ALL_PERMISSIONS,
      isOwner:        true,
    };
  }

  const member = ws.members[0];
  if (!member) return { ok: false, response: err("Unauthorized", 401) };

  const perms = member.role.permissions ?? [];

  if (permission && !can(perms, permission)) {
    return { ok: false, response: err("Forbidden", 403) };
  }

  return {
    ok: true,
    userId,
    workspaceId:    ws.id,
    organizationId: ws.organizationId,
    role:           member.role.name,
    permissions:    perms,
    isOwner:        false,
  };
}

/** Low-level helper — use requireAccess() in routes instead. */
export async function getWorkspaceAccess(): Promise<{
  userId: string; workspaceId: string; role: string;
} | null> {
  const r = await requireAccess();
  return r.ok ? r : null;
}

/**
 * Server-component helper: resolve workspace + caller's role from the URL
 * slug param. Returns role name + full permission list — server components
 * feed these into WorkspaceRoleProvider so client components can call
 * useRole().hasPermission() without an extra fetch.
 *
 * Optional `permission` arg gates page access. Behavior on denial:
 *   - User is NOT a member of the workspace → notFound() (page truly doesn't
 *     exist for them — they shouldn't know the workspace exists)
 *   - User IS a member but lacks the permission → redirect to the in-workspace
 *     `/forbidden?perm=<key>` page, which shows a human-readable explanation
 *     and a link back to the dashboard. Better UX than a bare 404.
 *
 *   // app/[workspaceSlug]/(dashboard)/orders/page.tsx
 *   const { workspaceId } = await requireWorkspaceFromSlug(slug, "orders:read");
 */
export async function requireWorkspaceFromSlug(
  slug: string,
  permission?: Permission,
): Promise<{
  userId:         string;
  workspaceId:    string;
  workspaceSlug:  string;
  organizationId: string;
  role:           string;
  permissions:    readonly string[];
  isOwner:        boolean;
}> {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  if (!userId) redirect("/login");

  const ws = await db.workspace.findFirst({
    where: { slug },
    select: {
      id: true,
      slug: true,
      organizationId: true,
      organization: { select: { ownerId: true } },
      members: {
        where: { userId },
        select: { role: { select: { name: true, permissions: true } } },
        take: 1,
      },
    },
  });
  if (!ws) notFound();

  const isOwner = ws.organization.ownerId === userId;
  if (isOwner) {
    return {
      userId,
      workspaceId:    ws.id,
      workspaceSlug:  ws.slug,
      organizationId: ws.organizationId,
      role:           "OWNER",
      permissions:    ALL_PERMISSIONS,
      isOwner:        true,
    };
  }

  const member = ws.members[0];
  if (!member) notFound();

  const perms = member.role.permissions ?? [];

  // Page-level permission gate. Member-but-no-perm → redirect to the
  // in-workspace 403 page (preserves layout, gives the user context). Versus
  // not-a-member → notFound() above (workspace shouldn't exist for them).
  if (permission && !perms.includes(permission)) {
    redirect(`/${ws.slug}/forbidden?perm=${encodeURIComponent(permission)}`);
  }

  return {
    userId,
    workspaceId:    ws.id,
    workspaceSlug:  ws.slug,
    organizationId: ws.organizationId,
    role:           member.role.name,
    permissions:    perms,
    isOwner:        false,
  };
}
