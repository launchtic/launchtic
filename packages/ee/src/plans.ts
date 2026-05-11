export type Plan = "FREE" | "PRO" | "ENTERPRISE";

export const PLAN_FEATURES = {
  FREE: {
    maxWorkspaces: 1,
    showBadge: true,
    whiteLabel: false,
    teamRoles: false,
    sso: false,
    auditLogs: false,
  },
  PRO: {
    maxWorkspaces: Infinity,
    showBadge: false,
    whiteLabel: true,
    teamRoles: true,
    sso: false,
    auditLogs: false,
  },
  ENTERPRISE: {
    maxWorkspaces: Infinity,
    showBadge: false,
    whiteLabel: true,
    teamRoles: true,
    sso: true,
    auditLogs: true,
  },
} satisfies Record<Plan, {
  maxWorkspaces: number;
  showBadge: boolean;
  whiteLabel: boolean;
  teamRoles: boolean;
  sso: boolean;
  auditLogs: boolean;
}>;

export function getPlanFeatures(plan: string) {
  if (plan in PLAN_FEATURES) return PLAN_FEATURES[plan as Plan];
  return PLAN_FEATURES.FREE;
}

export function canCreateWorkspace(plan: string, currentCount: number): boolean {
  const features = getPlanFeatures(plan);
  return currentCount < features.maxWorkspaces;
}
