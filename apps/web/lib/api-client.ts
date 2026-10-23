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
// /setup, /not-found) — those API calls don't need a workspace slug.
function currentWorkspaceSlug(): string | null {
  if (typeof window === "undefined") return null; // SSR — apiFetch is browser-only
  const first = window.location.pathname.split("/").filter(Boolean)[0];
  // Reserved paths that aren't workspace slugs. Keep this list minimal —
  // anything else with a leading segment is assumed to be a workspace.
  if (!first || first === "api" || first === "login" || first === "setup" || first === "_next") {
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
  const res = await fetch(input, { ...init, headers });
  // Public demo: many callers ignore a failed response, so the visitor saw
  // nothing happen. Show one notice here for every action the demo blocks.
  if (res.status === 403 && res.headers.get("x-demo-blocked") === "1") showDemoNotice();
  return res;
}

let demoNoticeTimer: ReturnType<typeof setTimeout> | null = null;

function showDemoNotice() {
  if (typeof document === "undefined") return;
  let el = document.getElementById("demo-blocked-notice");
  if (!el) {
    el = document.createElement("div");
    el.id = "demo-blocked-notice";
    el.setAttribute("role", "status");
    el.style.cssText =
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;" +
      "max-width:calc(100vw - 32px);padding:10px 16px;border-radius:12px;" +
      "background:#1f2937;color:#fff;font:500 14px/1.4 system-ui,sans-serif;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.2);text-align:center;";
    el.textContent = "This action is disabled in the live demo. Self-host Launchtic free to use every feature.";
    document.body.appendChild(el);
  }
  if (demoNoticeTimer) clearTimeout(demoNoticeTimer);
  demoNoticeTimer = setTimeout(() => el?.remove(), 4000);
}

/**
 * Trigger a file download from an authenticated API endpoint. Plain `<a download>`
 * doesn't carry our X-Workspace-Slug header (browsers don't run apiFetch on link
 * clicks), which makes the server return 400 "Missing workspace context". This
 * helper fetches via apiFetch, materializes the response as a Blob, and clicks
 * a synthetic anchor to save it. Filename comes from Content-Disposition.
 */
export async function downloadFromApi(url: string, fallbackFilename: string): Promise<void> {
  const res = await apiFetch(url);
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j.error ? `: ${j.error}` : ""; } catch {}
    throw new Error(`Download failed (${res.status})${detail}`);
  }
  let filename = fallbackFilename;
  const cd = res.headers.get("Content-Disposition");
  if (cd) {
    const m = cd.match(/filename="([^"]+)"/) ?? cd.match(/filename=([^;]+)/);
    if (m) filename = m[1].trim();
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
