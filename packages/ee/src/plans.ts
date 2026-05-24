// Plan feature matrix — single source of truth for tier-gated features.
// Names match the DB enum (apps/web/lib/plan.ts):
//   COMMUNITY  — free self-host, solo workspace, no team
//   STARTER    — $299/yr     · 3 team members, roles, premium templates
//   AGENCY     — $1,499/yr   · multi-workspace, unlimited team, white-label
//   CUSTOM     — contact     · SSO, audit, SLA

export type Plan = "COMMUNITY" | "STARTER" | "AGENCY" | "CUSTOM";

export const PLAN_FEATURES = {
  COMMUNITY: {
    maxWorkspaces:   1,
    maxTeamMembers:  1,
    premiumTemplates: false,
    whiteLabel:      false,
    teamRoles:       false,
    workspaceCloning: false,
    sso:             false,
    auditLogs:       false,
  },
  STARTER: {
    maxWorkspaces:   1,
    maxTeamMembers:  3,
    premiumTemplates: true,
    whiteLabel:      false,
    teamRoles:       true,
    workspaceCloning: false,
    sso:             false,
    auditLogs:       false,
  },
  AGENCY: {
    maxWorkspaces:   Infinity,
    maxTeamMembers:  Infinity,
    premiumTemplates: true,
    whiteLabel:      true,
    teamRoles:       true,
    workspaceCloning: true,
    sso:             false,
    auditLogs:       false,
  },
  CUSTOM: {
    maxWorkspaces:   Infinity,
    maxTeamMembers:  Infinity,
    premiumTemplates: true,
    whiteLabel:      true,
    teamRoles:       true,
    workspaceCloning: true,
    sso:             true,
    auditLogs:       true,
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

export function canCreateWorkspace(plan: string, currentCount: number): boolean {
  const features = getPlanFeatures(plan);
  return currentCount < features.maxWorkspaces;
}

export function canCloneWorkspace(plan: string): boolean {
  return getPlanFeatures(plan).workspaceCloning;
}

export function canInviteTeamMember(plan: string, currentCount: number): boolean {
  return currentCount < getPlanFeatures(plan).maxTeamMembers;
}
