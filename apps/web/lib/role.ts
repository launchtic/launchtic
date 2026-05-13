"use client";

import { useSession } from "next-auth/react";

export type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

const ROLE_RANK: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

export function useRole() {
  const { data: session } = useSession();
  const role = ((session as any)?.workspaceRole ?? "VIEWER") as Role;

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
