// Single source of truth for tier-gated features. Combines the plan enum,
// feature matrix, and runtime predicates. Was previously split between
// `apps/web/lib/plan.ts` (predicates) and `packages/ee/src/plans.ts` (matrix);
// merged because:
//   - No actual EE-locked runtime lived there, just declarative metadata
//   - `Plan` type was duplicated across both files
//   - Only `apps/web` consumed it — extra package = pure overhead
//
// Names match the DB enum:
//   COMMUNITY  — free self-host, solo workspace, no team
//   STARTER    — $299/yr     · 3 team members, roles, premium templates
//   AGENCY     — $1,499/yr   · multi-workspace, unlimited team, white-label
//   CUSTOM     — contact     · SSO, audit, SLA
//
// License key prefix → plan (verified on launchtic.com side):
//   LT-STR-* → STARTER
//   LT-AGY-* → AGENCY
//   LT-CUS-* → CUSTOM

export type Plan = "COMMUNITY" | "STARTER" | "AGENCY" | "CUSTOM";

// ─── Feature matrix ─────────────────────────────────────────────────────────

export const PLAN_FEATURES = {
  COMMUNITY: {
    maxWorkspaces:    1,
    maxTeamMembers:   1,
    premiumTemplates: false,
    whiteLabel:       false,
    teamRoles:        false,
    workspaceCloning: false,
    sso:              false,
    auditLogs:        false,
  },
  STARTER: {
    maxWorkspaces:    1,
    maxTeamMembers:   3,
    premiumTemplates: true,
    whiteLabel:       false,
    teamRoles:        true,
    workspaceCloning: false,
    sso:              false,
    auditLogs:        false,
  },
  AGENCY: {
    maxWorkspaces:    Infinity,
    maxTeamMembers:   Infinity,
    premiumTemplates: true,
    whiteLabel:       true,
    teamRoles:        true,
    workspaceCloning: true,
    sso:              false,
    auditLogs:        false,
  },
  CUSTOM: {
    maxWorkspaces:    Infinity,
    maxTeamMembers:   Infinity,
    premiumTemplates: true,
    whiteLabel:       true,
    teamRoles:        true,
    workspaceCloning: true,
    sso:              true,
    auditLogs:        true,
  },
} satisfies Record<Plan, {
  maxWorkspaces:    number;
  maxTeamMembers:   number;
  premiumTemplates: boolean;
  whiteLabel:       boolean;
  teamRoles:        boolean;
  workspaceCloning: boolean;
  sso:              boolean;
  auditLogs:        boolean;
}>;

export function getPlanFeatures(plan: string) {
  if (plan in PLAN_FEATURES) return PLAN_FEATURES[plan as Plan];
  return PLAN_FEATURES.COMMUNITY;
}

// ─── Capability predicates ──────────────────────────────────────────────────

export function canCreateWorkspace(plan: string, currentCount: number): boolean {
  return currentCount < getPlanFeatures(plan).maxWorkspaces;
}

export function canCloneWorkspace(plan: string): boolean {
  return getPlanFeatures(plan).workspaceCloning;
}

/** currentCount must include the Organization owner (who has no
 *  WorkspaceMember row but counts as a seat). */
export function canInviteTeamMember(plan: string, currentCount: number): boolean {
  return currentCount < getPlanFeatures(plan).maxTeamMembers;
}

// ─── Tier predicates ────────────────────────────────────────────────────────

/** Any paid tier. Gates premium templates, team management, etc. */
export function isPaidPlan(plan: string | null | undefined): boolean {
  return plan === "STARTER" || plan === "AGENCY" || plan === "CUSTOM";
}

/** Agency tier or above. Gates multi-workspace, unlimited team, white-label, cloning. */
export function isAgencyPlan(plan: string | null | undefined): boolean {
  return plan === "AGENCY" || plan === "CUSTOM";
}

/** Custom (top) tier. Gates SSO, audit logs, custom SLA. */
export function isCustomPlan(plan: string | null | undefined): boolean {
  return plan === "CUSTOM";
}

// ─── Display helpers ────────────────────────────────────────────────────────

const COLORS: Record<Plan, string> = {
  COMMUNITY: "bg-gray-100 text-gray-700",
  STARTER:   "bg-blue-100 text-blue-700",
  AGENCY:    "bg-purple-100 text-purple-700",
  CUSTOM:    "bg-amber-100 text-amber-700",
};

/** Tailwind classes for plan-tier badges. */
export function planColor(plan: string | null | undefined): string {
  if (!plan) return COLORS.COMMUNITY;
  return COLORS[plan as Plan] ?? COLORS.COMMUNITY;
}

/** Render-ready label. Title-case for the badge; enum is already SHOUTY. */
export function planLabel(plan: string | null | undefined): string {
  if (!plan) return "Community";
  const v = (plan as string).toUpperCase();
  return v.charAt(0) + v.slice(1).toLowerCase();
}
