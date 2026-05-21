"use client";

import { useWorkspaceRole, type Role } from "../components/WorkspaceRoleProvider";

export type { Role };

const ROLE_RANK: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

// Reads role from WorkspaceRoleProvider (URL-driven, set by dashboard layout).
// Previously read from session.workspaceRole — that field was removed during
// the URL-driven refactor and silently defaulted to VIEWER, hiding every
// create/edit button in the UI.
export function useRole() {
  const role = useWorkspaceRole();
  return {
    role,
    isOwner:  role === "OWNER",
    isAdmin:  role === "OWNER" || role === "ADMIN",
    canWrite: role === "OWNER" || role === "ADMIN" || role === "EDITOR",
    canManageSettings: role === "OWNER" || role === "ADMIN",
    canManageBilling:  role === "OWNER",
    canManageTeam:     role === "OWNER" || role === "ADMIN",
    atLeast: (min: Role) => ROLE_RANK[role] >= ROLE_RANK[min],
  };
}
