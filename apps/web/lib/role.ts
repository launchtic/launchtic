"use client";

import { useWorkspaceRole } from "../components/WorkspaceRoleProvider";

// Client-side permission helpers. Reads role + permissions from
// WorkspaceRoleProvider context (URL-driven, set by dashboard layout).
//
// Pattern: prefer `hasPermission("foo:bar")` for granular checks. The
// domain helpers below are convenience for common gates.
//
// OWNER (Organization founder) automatically passes every check via the
// isOwner flag — they have all permissions.

export function useRole() {
  const { role, permissions, isOwner } = useWorkspaceRole();

  const hasPermission = (perm: string): boolean =>
    isOwner || permissions.includes(perm);

  return {
    role,
    isOwner,
    permissions,
    hasPermission,

    // ─── Domain shortcuts (granular per resource/action) ────────────────

    // AI Assistant — gates the floating chat widget + /api/ai/chat. Separate
    // from settings:ai:read/write (which gate viewing/editing the AI config).
    canUseAi:              hasPermission("ai:use"),

    // Funnels (dashboard intentionally has no helper — page is always
    // accessible; cards inside self-gate on their underlying resource perm)
    canReadFunnels:        hasPermission("funnels:read"),
    canManageFunnels:      hasPermission("funnels:write"),
    canDeleteFunnels:      hasPermission("funnels:delete"),
    // Sub-gates inside a funnel step (revenue-sensitive — see permissions.ts).
    // Reads still come through `canReadFunnels`; these only gate writes.
    canManagePricePlans:   hasPermission("funnels:price_plans:write"),
    canManageBumps:        hasPermission("funnels:bumps:write"),

    // Products
    canReadProducts:       hasPermission("products:read"),
    canManageProducts:     hasPermission("products:write"),
    canDeleteProducts:     hasPermission("products:delete"),

    // Sales — Orders / Subscriptions / Transactions
    canReadOrders:         hasPermission("orders:read"),
    canRefundOrders:       hasPermission("orders:refund"),
    canReadSubscriptions:  hasPermission("subscriptions:read"),
    canCancelSubscriptions: hasPermission("subscriptions:cancel"),
    canReadTransactions:   hasPermission("transactions:read"),

    // Coupons
    canReadCoupons:        hasPermission("coupons:read"),
    canManageCoupons:      hasPermission("coupons:write"),
    canDeleteCoupons:      hasPermission("coupons:delete"),

    // Contacts
    canReadContacts:       hasPermission("contacts:read"),
    canManageContacts:     hasPermission("contacts:write"),
    canDeleteContacts:     hasPermission("contacts:delete"),
    canImportContacts:     hasPermission("contacts:import"),
    canExportContacts:     hasPermission("contacts:export"),

    // Tags
    canReadTags:           hasPermission("tags:read"),
    canManageTags:         hasPermission("tags:write"),
    canDeleteTags:         hasPermission("tags:delete"),

    // Emails — Broadcasts / Sequences / Templates / Logs
    canReadBroadcasts:     hasPermission("broadcasts:read"),
    canManageBroadcasts:   hasPermission("broadcasts:write"),
    canSendBroadcasts:     hasPermission("broadcasts:send"),
    canDeleteBroadcasts:   hasPermission("broadcasts:delete"),
    canReadSequences:      hasPermission("sequences:read"),
    canManageSequences:    hasPermission("sequences:write"),
    canDeleteSequences:    hasPermission("sequences:delete"),
    canReadEmailTemplates: hasPermission("email_templates:read"),
    canManageEmailTemplates: hasPermission("email_templates:write"),
    canDeleteEmailTemplates: hasPermission("email_templates:delete"),
    canReadEmailLogs:      hasPermission("email_logs:read"),
    canResendEmails:       hasPermission("email_logs:resend"),

    // Automations
    canReadAutomations:    hasPermission("automations:read"),
    canManageAutomations:  hasPermission("automations:write"),
    canDeleteAutomations:  hasPermission("automations:delete"),

    // Media
    canReadMedia:          hasPermission("media:read"),
    canUploadMedia:        hasPermission("media:upload"),
    canDeleteMedia:        hasPermission("media:delete"),

    // Settings per sub-tab
    canReadGeneralSettings:   hasPermission("settings:general:read"),
    canManageGeneralSettings: hasPermission("settings:general:write"),
    canReadDomains:           hasPermission("settings:domains:read"),
    canManageDomains:         hasPermission("settings:domains:write"),
    canReadPayment:           hasPermission("settings:payment:read"),
    canManagePayment:         hasPermission("settings:payment:write"),
    canReadEmailSettings:     hasPermission("settings:email:read"),
    canManageEmailSettings:   hasPermission("settings:email:write"),
    canReadStorage:           hasPermission("settings:storage:read"),
    canManageStorage:         hasPermission("settings:storage:write"),
    canReadPageTemplates:     hasPermission("settings:page_templates:read"),
    canManagePageTemplates:   hasPermission("settings:page_templates:write"),
    canReadAi:                hasPermission("settings:ai:read"),
    canManageAi:              hasPermission("settings:ai:write"),

    // Team / Roles
    canReadMembers:        hasPermission("members:read"),
    canManageTeam:         hasPermission("members:manage"),
    canReadRoles:          hasPermission("roles:read"),
    canManageRoles:        hasPermission("roles:manage"),

    // ─── Legacy / aggregate helpers (backward compat) ───────────────────
    isAdmin: isOwner || role === "Admin",
    /** Any content write — kept for existing components, prefer specific. */
    canWrite:
      hasPermission("funnels:write") ||
      hasPermission("contacts:write") ||
      hasPermission("broadcasts:write") ||
      hasPermission("sequences:write") ||
      hasPermission("email_templates:write") ||
      hasPermission("automations:write"),
    /** Legacy alias of canManageGeneralSettings — components may use this. */
    canManageSettings: hasPermission("settings:general:write"),
  };
}
