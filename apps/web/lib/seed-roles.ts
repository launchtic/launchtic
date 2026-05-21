// Default roles seeded into every new workspace. Functional naming aligned
// with marketing-team conventions (Kartra/ActiveCampaign/Webflow style):
//
//   Admin    — Full workspace control except billing + workspace deletion
//   Marketer — Campaigns: funnels + emails + automations + contacts
//   Designer — Page builder: funnels + media + page templates
//   Viewer   — Read-only access (client preview, auditor)
//
// OWNER is NOT a role — derived from Organization.ownerId and bypasses
// permission checks via requireAccess() shortcut. So this list never
// includes OWNER (it would always be "all").
//
// All seeded roles are editable/deletable. Guardrails (cannot delete role
// with members, cannot remove last role with roles:manage) live in the
// /api/roles DELETE handler — not enforced at schema level.

import type { Prisma, PrismaClient } from "@launchtic/database";

export const DEFAULT_ROLES = [
  {
    name: "Admin",
    description: "Full workspace control except billing and workspace deletion.",
    permissions: [
      "dashboard:read",
      // Funnels & Sales
      "funnels:read", "funnels:write", "funnels:delete",
      "products:read", "products:write", "products:delete",
      "orders:read", "orders:refund",
      "subscriptions:read", "subscriptions:cancel",
      "transactions:read",
      "coupons:read", "coupons:write", "coupons:delete",
      // Contacts
      "contacts:read", "contacts:write", "contacts:delete", "contacts:import", "contacts:export",
      "tags:read", "tags:write", "tags:delete",
      // Emails
      "broadcasts:read", "broadcasts:write", "broadcasts:send", "broadcasts:delete",
      "sequences:read", "sequences:write", "sequences:delete",
      "email_templates:read", "email_templates:write", "email_templates:delete",
      "email_logs:read", "email_logs:resend",
      // Automations
      "automations:read", "automations:write", "automations:delete",
      // Media
      "media:read", "media:upload", "media:delete",
      // Settings — full access except billing/workspace deletion
      "settings:general:read", "settings:general:write",
      "settings:domains:read", "settings:domains:write",
      "settings:payment:read", "settings:payment:write",
      "settings:email:read", "settings:email:write",
      "settings:storage:read", "settings:storage:write",
      "settings:page_templates:read", "settings:page_templates:write",
      "settings:ai:read", "settings:ai:write",
      // Team / Roles
      "members:read", "members:manage",
      "roles:read", "roles:manage",
    ],
  },
  {
    name: "Marketer",
    description: "Run campaigns end-to-end. Funnels, emails, automations, contacts.",
    permissions: [
      "dashboard:read",
      // Funnels & Sales — read most, write content but not delete
      "funnels:read", "funnels:write",
      "products:read",
      "orders:read",
      "subscriptions:read",
      "coupons:read", "coupons:write",
      // Contacts — full work except delete + export
      "contacts:read", "contacts:write", "contacts:import",
      "tags:read", "tags:write",
      // Emails — create and send, but not delete
      "broadcasts:read", "broadcasts:write", "broadcasts:send",
      "sequences:read", "sequences:write",
      "email_templates:read", "email_templates:write",
      "email_logs:read", "email_logs:resend",
      // Automations — write but not delete
      "automations:read", "automations:write",
      // Media — upload, no delete
      "media:read", "media:upload",
    
      "settings:page_templates:read",
      // Team — see members only
      "members:read",
    ],
  },
  {
    name: "Designer",
    description: "Build pages and manage media. No CRM, no campaigns.",
    permissions: [
      "dashboard:read",
      // Funnels & Pages — write but not delete
      "funnels:read", "funnels:write",
      // Email templates — read to copy styles
      "email_templates:read",
      // Media — full management for assets
      "media:read", "media:upload", "media:delete",
      "settings:page_templates:read", "settings:page_templates:write",
    ],
  },
  {
    name: "Viewer",
    description: "Read-only access across the workspace.",
    permissions: [
      "dashboard:read",
      // All read perms, no writes
      "funnels:read",
      "products:read",
      "orders:read",
      "subscriptions:read",
      "transactions:read",
      "coupons:read",
      "contacts:read",
      "tags:read",
      "broadcasts:read",
      "sequences:read",
      "email_templates:read",
      "email_logs:read",
      "automations:read",
      "media:read",
      "settings:page_templates:read",
      "members:read",
    ],
  },
] as const;

/**
 * Seed the 4 default roles for a workspace. Called inside the create-workspace
 * transaction (register endpoint + POST /api/workspaces). Returns the inserted
 * role rows so callers can grab the Admin role ID for the founder's first
 * WorkspaceMember row.
 */
export async function seedDefaultRoles(
  tx: Prisma.TransactionClient | PrismaClient,
  workspaceId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await Promise.all(
    DEFAULT_ROLES.map((r) =>
      tx.role.create({
        data: {
          workspaceId,
          name:        r.name,
          description: r.description,
          permissions: [...r.permissions],
        },
        select: { id: true, name: true },
      })
    )
  );
  return rows;
}

/** Find the Admin role of a workspace — used to seat the founder. */
export function findAdminRoleId(roles: { id: string; name: string }[]): string {
  const admin = roles.find((r) => r.name === "Admin");
  if (!admin) throw new Error("Admin role not found after seed — corrupt seed");
  return admin.id;
}
