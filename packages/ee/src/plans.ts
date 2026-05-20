// Plan feature matrix — single source of truth for tier-gated features.
// Names match the DB enum (apps/web/lib/plan.ts):
//   COMMUNITY  — free self-host
//   STARTER    — $299/yr     · removes branding + premium templates
//   AGENCY     — $1,499/yr   · multi-workspace, team, white-label
//   CUSTOM     — contact     · SSO, audit, SLA

export type Plan = "COMMUNITY" | "STARTER" | "AGENCY" | "CUSTOM";

export const PLAN_FEATURES = {
  COMMUNITY: {
    maxWorkspaces: 1,
    showBadge: true,
    premiumTemplates: false,
    whiteLabel: false,
    teamRoles: false,
    workspaceCloning: false,
    sso: false,
    auditLogs: false,
  },
  STARTER: {
    maxWorkspaces: 1,
    showBadge: false,
    premiumTemplates: true,
    whiteLabel: false,
    teamRoles: false,
    workspaceCloning: false,
    sso: false,
    auditLogs: false,
  },
  AGENCY: {
    maxWorkspaces: Infinity,
    showBadge: false,
    premiumTemplates: true,
    whiteLabel: true,
    teamRoles: true,
    workspaceCloning: true,
    sso: false,
    auditLogs: false,
  },
  CUSTOM: {
    maxWorkspaces: Infinity,
    showBadge: false,
    premiumTemplates: true,
    whiteLabel: true,
    teamRoles: true,
    workspaceCloning: true,
    sso: true,
    auditLogs: true,
  },
} satisfies Record<Plan, {
  maxWorkspaces:    number;
  showBadge:        boolean;
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

export function canCreateWorkspace(plan: string, currentCount: number): boolean {
  const features = getPlanFeatures(plan);
  return currentCount < features.maxWorkspaces;
}
