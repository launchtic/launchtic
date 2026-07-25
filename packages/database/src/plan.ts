// Single source of truth for tier-gated features. Combines the plan enum,
// feature matrix, and runtime predicates.
//
// Self-host is free forever — no license needed. Two tiers sit above it:
//   FREE     — 1 workspace, 1 admin (no team invites). Everything else
//              (funnels, checkout, CRM, workflows, analytics, A/B, AI) is
//              fully unlocked. This is Organization.plan = null.
//   AGENCY   — $997/yr subscription. FREE + unlimited workspaces/team,
//              advanced roles & permissions, white-label & workspace cloning.
//
// CUSTOM is a sales-assisted enterprise superset (SSO, audit logs) — not
// self-serve.
//
// The plan is authoritative on the launchtic.com side (License.plan) and
// returned by license verification — it is NOT derived from the key. Keys are
// tier-agnostic.
//
// A `null` plan is NOT an error/locked state — it's the FREE tier. It also
// covers a lapsed/revoked Agency subscription (reVerifyIfStale nulls the
// plan), which correctly falls back to FREE rather than locking the instance
// out entirely.
//
// Lives in @launchtic/database (not apps/web) because both the core app AND
// @launchtic/ee need it — packages can't import from apps, so the shared
// plan/organization primitives sit here as the common dependency root.

export type PlanTier = "AGENCY" | "CUSTOM";

export type PlanFeatures = {
  maxWorkspaces:    number;
  maxTeamMembers:   number;
  premiumTemplates: boolean;
  teamRoles:        boolean;   // full roles & permissions (Agency+)
  abTesting:        boolean;
  upsells:          boolean;   // 1-click upsells & downsells
  funnelAnalytics:  boolean;
  whiteLabel:       boolean;   // Agency+
  workspaceCloning: boolean;   // Agency+
  sso:              boolean;   // Custom
  auditLogs:        boolean;   // Custom
};

// ─── Feature matrix ─────────────────────────────────────────────────────────

// No license (self-host default). Single workspace, solo admin — no team
// invites — but every other capability (funnels, checkout, CRM, workflows,
// analytics, A/B, AI assistant) is fully unlocked.
const FREE: PlanFeatures = {
  maxWorkspaces: 1, maxTeamMembers: 1,
  premiumTemplates: true, teamRoles: false,
  abTesting: true, upsells: true, funnelAnalytics: true,
  whiteLabel: false, workspaceCloning: false,
  sso: false, auditLogs: false,
};

export const PLAN_FEATURES: Record<PlanTier, PlanFeatures> = {
  AGENCY: {
    maxWorkspaces: Infinity, maxTeamMembers: Infinity,
    premiumTemplates: true, teamRoles: true,
    abTesting: true, upsells: true, funnelAnalytics: true,
    whiteLabel: true, workspaceCloning: true,
    sso: false, auditLogs: false,
  },
  CUSTOM: {
    maxWorkspaces: Infinity, maxTeamMembers: Infinity,
    premiumTemplates: true, teamRoles: true,
    abTesting: true, upsells: true, funnelAnalytics: true,
    whiteLabel: true, workspaceCloning: true,
    sso: true, auditLogs: true,
  },
};

/** Feature set for a plan. Null / undefined / unrecognized → FREE. */
export function getPlanFeatures(plan: string | null | undefined): PlanFeatures {
  if (plan && plan in PLAN_FEATURES) return PLAN_FEATURES[plan as PlanTier];
  return FREE;
}

// ─── Capability predicates ──────────────────────────────────────────────────

export function canCreateWorkspace(plan: string | null | undefined, currentCount: number): boolean {
  return currentCount < getPlanFeatures(plan).maxWorkspaces;
}

export function canCloneWorkspace(plan: string | null | undefined): boolean {
  return getPlanFeatures(plan).workspaceCloning;
}

/** currentCount must include the Organization owner (who has no
 *  WorkspaceMember row but counts as a seat). */
export function canInviteTeamMember(plan: string | null | undefined, currentCount: number): boolean {
  return currentCount < getPlanFeatures(plan).maxTeamMembers;
}

// ─── Tier predicates ────────────────────────────────────────────────────────

/** Agency tier or above. Gates white-label, cloning, roles/team, reseller, client billing. */
export function isAgencyPlan(plan: string | null | undefined): boolean {
  return plan === "AGENCY" || plan === "CUSTOM";
}

/** Custom (top) tier. Gates SSO, audit logs, custom SLA. */
export function isCustomPlan(plan: string | null | undefined): boolean {
  return plan === "CUSTOM";
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const COLORS: Record<PlanTier, string> = {
  AGENCY: "bg-purple-100 text-purple-700",
  CUSTOM: "bg-amber-100 text-amber-700",
};

const FREE_COLOR = "bg-gray-100 text-gray-500";

/** Tailwind classes for plan-tier badges. Null/FREE → muted gray. */
export function planColor(plan: string | null | undefined): string {
  if (!plan) return FREE_COLOR;
  return COLORS[plan as PlanTier] ?? FREE_COLOR;
}

/** Render-ready label. Title-case for the badge; enum is already SHOUTY. */
export function planLabel(plan: string | null | undefined): string {
  if (!plan) return "Free";
  if (plan === "CUSTOM") return "Enterprise";
  const v = plan.toUpperCase();
  return v.charAt(0) + v.slice(1).toLowerCase();
}
