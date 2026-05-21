"use client";

import { createContext, useContext } from "react";

// Workspace role for the current URL workspace. Fetched once server-side in
// the dashboard layout (via requireWorkspaceFromSlug) and passed down via
// this context, so every client component can call useRole() without making
// an extra HTTP round-trip. Source of truth = URL workspace, not session —
// matches the rest of the URL-driven architecture.

export type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

const RoleContext = createContext<Role>("VIEWER");

export function WorkspaceRoleProvider({
  role,
  children,
}: {
  role: string;
  children: React.ReactNode;
}) {
  return <RoleContext.Provider value={(role as Role) ?? "VIEWER"}>{children}</RoleContext.Provider>;
}

export function useWorkspaceRole(): Role {
  return useContext(RoleContext);
}
