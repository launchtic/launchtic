// Workspace-aware fetch wrapper. Auto-injects `X-Workspace-Slug` from the
// current URL path so every API call is scoped to the workspace the user is
// *currently browsing* — not whatever workspace their session last selected.
//
// Why this exists: session.workspaceId is global per user. If the operator
// opens tab A in workspace "client-a" and tab B in workspace "client-b",
// session only points at one of them at a time. Without this header, every
// API call would silently use the session workspace, and tab A would query
// client-b data. Industry standard (Linear, Vercel, GitHub) is URL-driven.
//
// Usage — drop-in replacement for fetch():
//   import { apiFetch } from "@/lib/api-client";
//   const res = await apiFetch("/api/funnels", { method: "POST", body: ... });
//
// Server side: lib/permissions.ts `requireAccess()` reads this header. Falls
// back to session.workspaceId if the header is missing (for backward compat
// during migration).

// First path segment from /{slug}/dashboard, /{slug}/funnels/abc, etc.
// Returns null when called outside a workspace-scoped page (e.g. /login,
// /register, /not-found) — those API calls don't need a workspace slug.
function currentWorkspaceSlug(): string | null {
  if (typeof window === "undefined") return null; // SSR — apiFetch is browser-only
  const first = window.location.pathname.split("/").filter(Boolean)[0];
  // Reserved paths that aren't workspace slugs. Keep this list minimal —
  // anything else with a leading segment is assumed to be a workspace.
  if (!first || first === "api" || first === "login" || first === "register" || first === "_next") {
    return null;
  }
  return first;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const slug = currentWorkspaceSlug();
  const headers = new Headers(init?.headers);
  // Don't clobber a slug the caller set explicitly (escape hatch for cross-
  // workspace admin tools, if we ever build them).
  if (slug && !headers.has("x-workspace-slug")) {
    headers.set("x-workspace-slug", slug);
  }
  return fetch(input, { ...init, headers });
}
