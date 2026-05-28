// Single source of truth for tier-gated features. Combines the plan enum,
// feature matrix, and runtime predicates.
//
// Names match the DB enum (no free tier — Launchtic is one-time-license only):
//   SOLO     — $199 · 1 user, 1 workspace, 3 domains, core features
//   STARTER  — $449 · 5 team members, 10 domains, basic roles, A/B, upsells, analytics
//   AGENCY   — $1,499 · unlimited workspaces/team/domains, advanced roles, white-label, reseller
//   CUSTOM   — contact sales · SSO, audit logs, SLA
//
// A `null` plan = NO valid license (pre-activation, revoked, or deactivated).
// It resolves to the LOCKED feature set below — everything off. There is no
// "Community"/free tier anymore; an unlicensed instance is locked, not degraded
// to a usable free plan.
//
// License key prefix → plan (verified on launchtic.com side):
//   LT-SOL-* → SOLO    LT-STR-* → STARTER
//   LT-AGY-* → AGENCY  LT-CUS-* → CUSTOM

export type Plan = "SOLO" | "STARTER" | "AGENCY" | "CUSTOM";

export type PlanFeatures = {
  maxWorkspaces:    number;
  maxTeamMembers:   number;
  maxDomains:       number;
  premiumTemplates: boolean;
  teamRoles:        boolean;   // full roles & permissions (Starter+ — single tier, not basic/advanced)
  abTesting:        boolean;   // Starter+
  upsells:          boolean;   // 1-click upsells & downsells (Starter+)
  funnelAnalytics:  boolean;   // Starter+
  whiteLabel:       boolean;   // Agency+
  workspaceCloning: boolean;   // Agency+
  sso:              boolean;   // Custom
  auditLogs:        boolean;   // Custom
};

// ─── Feature matrix ─────────────────────────────────────────────────────────

// No valid license. Every capability off, every limit zero. An instance in
// this state shows the activation prompt instead of degraded functionality.
const LOCKED: PlanFeatures = {
  maxWorkspaces: 0, maxTeamMembers: 0, maxDomains: 0,
  premiumTemplates: false, teamRoles: false,
  abTesting: false, upsells: false, funnelAnalytics: false,
  whiteLabel: false, workspaceCloning: false,
  sso: false, auditLogs: false,
};

export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  SOLO: {
    maxWorkspaces: 1, maxTeamMembers: 1, maxDomains: 3,
    premiumTemplates: false, teamRoles: false,
    abTesting: false, upsells: false, funnelAnalytics: false,
    whiteLabel: false, workspaceCloning: false,
    sso: false, auditLogs: false,
  },
  STARTER: {
    maxWorkspaces: 1, maxTeamMembers: 5, maxDomains: 10,
    premiumTemplates: true, teamRoles: true,
    abTesting: true, upsells: true, funnelAnalytics: true,
    whiteLabel: false, workspaceCloning: false,
    sso: false, auditLogs: false,
  },
  AGENCY: {
    maxWorkspaces: Infinity, maxTeamMembers: Infinity, maxDomains: Infinity,
    premiumTemplates: true, teamRoles: true,
    abTesting: true, upsells: true, funnelAnalytics: true,
    whiteLabel: true, workspaceCloning: true,
    sso: false, auditLogs: false,
  },
  CUSTOM: {
    maxWorkspaces: Infinity, maxTeamMembers: Infinity, maxDomains: Infinity,
    premiumTemplates: true, teamRoles: true,
    abTesting: true, upsells: true, funnelAnalytics: true,
    whiteLabel: true, workspaceCloning: true,
    sso: true, auditLogs: true,
  },
};

/** Feature set for a plan. Unknown / null / undefined → LOCKED (no license). */
export function getPlanFeatures(plan: string | null | undefined): PlanFeatures {
  if (plan && plan in PLAN_FEATURES) return PLAN_FEATURES[plan as Plan];
  return LOCKED;
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

/** currentCount = custom domains already configured on the instance. */
export function canAddDomain(plan: string | null | undefined, currentCount: number): boolean {
  return currentCount < getPlanFeatures(plan).maxDomains;
}

// ─── Tier predicates ────────────────────────────────────────────────────────

/** Any valid paid tier (i.e. licensed). False when locked / null. */
export function isPaidPlan(plan: string | null | undefined): boolean {
  return plan === "SOLO" || plan === "STARTER" || plan === "AGENCY" || plan === "CUSTOM";
}

/** Agency tier or above. Gates white-label, cloning, reseller, client billing. */
export function isAgencyPlan(plan: string | null | undefined): boolean {
  return plan === "AGENCY" || plan === "CUSTOM";
}

/** Custom (top) tier. Gates SSO, audit logs, custom SLA. */
export function isCustomPlan(plan: string | null | undefined): boolean {
  return plan === "CUSTOM";
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const COLORS: Record<Plan, string> = {
  SOLO:    "bg-emerald-100 text-emerald-700",
  STARTER: "bg-blue-100 text-blue-700",
  AGENCY:  "bg-purple-100 text-purple-700",
  CUSTOM:  "bg-amber-100 text-amber-700",
};

const LOCKED_COLOR = "bg-gray-100 text-gray-500";

/** Tailwind classes for plan-tier badges. Null/locked → muted gray. */
export function planColor(plan: string | null | undefined): string {
  if (!plan) return LOCKED_COLOR;
  return COLORS[plan as Plan] ?? LOCKED_COLOR;
}

/** Render-ready label. Title-case for the badge; enum is already SHOUTY. */
export function planLabel(plan: string | null | undefined): string {
  if (!plan) return "Unlicensed";
  if (plan === "CUSTOM") return "Enterprise";
  const v = plan.toUpperCase();
  return v.charAt(0) + v.slice(1).toLowerCase();
}
