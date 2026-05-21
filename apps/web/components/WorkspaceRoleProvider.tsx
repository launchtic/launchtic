"use client";

import { createContext, useContext } from "react";

// Workspace role + permission context for the current URL workspace.
// Resolved once server-side in the dashboard layout (via
// requireWorkspaceFromSlug) and passed down so client components can call
// useRole() without an extra round-trip. Source of truth = URL workspace,
// not session — matches the URL-driven architecture.
//
// `role` is a string label (one of the role names — "Admin", "Marketer",
// "Designer", "Viewer", custom names, or "OWNER" for the founder). UI
// should NOT switch behavior on role strings — use `hasPermission()` via
// useRole() so custom roles work the same as defaults.
//
// `permissions` is the effective permission list (full set when isOwner).
// `isOwner` is true when the user is the Organization.ownerId — bypassed
// every permission check.

export type WorkspaceRoleContextValue = {
  role: string;
  permissions: readonly string[];
  isOwner: boolean;
};

const DEFAULT: WorkspaceRoleContextValue = {
  role: "Viewer",
  permissions: [],
  isOwner: false,
};

const RoleContext = createContext<WorkspaceRoleContextValue>(DEFAULT);

export function WorkspaceRoleProvider({
  role,
  permissions,
  isOwner,
  children,
}: {
  role: string;
  permissions: readonly string[];
  isOwner: boolean;
  children: React.ReactNode;
}) {
  return (
    <RoleContext.Provider value={{ role, permissions, isOwner }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useWorkspaceRole(): WorkspaceRoleContextValue {
  return useContext(RoleContext);
}
