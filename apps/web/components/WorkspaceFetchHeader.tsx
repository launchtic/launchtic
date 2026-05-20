"use client";

import { useEffect } from "react";

// Monkey-patches window.fetch to inject `X-Workspace-Slug` on every /api/*
// request made while a workspace page is mounted. Catches fetches from:
//   - Third-party packages (launchtic-elements editor — raw fetch())
//   - Any client code that bypassed the apiFetch helper
//   - Async fetches fired after a component unmounts but before navigation
//
// Why monkey-patch instead of expecting every caller to use apiFetch:
//   - The editor is in an external package we don't fully control
//   - One source of truth — slug comes from URL, set once at workspace mount
//   - Manual apiFetch migration is best-effort; this is the safety net
//
// Scope discipline — patch only:
//   - Same-origin requests starting with /api/ (skip cross-origin, assets, etc.)
//   - When slug is non-empty
// Restore original fetch on unmount so navigating away from a workspace
// (e.g. to /login) doesn't leak the header into auth flows.

export default function WorkspaceFetchHeader({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;
    const originalFetch = window.fetch.bind(window);

    window.fetch = function patched(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url =
        typeof input === "string" ? input :
        input instanceof URL      ? input.pathname + input.search :
                                    (input as Request).url;

      // Only inject for our own /api/ endpoints. URLs starting with "http"
      // are external (third-party CDNs etc.) — leave untouched.
      const isOurApi =
        url.startsWith("/api/") ||
        url.startsWith(window.location.origin + "/api/");

      if (!isOurApi) return originalFetch(input, init);

      const headers = new Headers(init?.headers);
      // Caller's explicit header wins (escape hatch for cross-workspace tools).
      if (!headers.has("x-workspace-slug")) {
        headers.set("x-workspace-slug", slug);
      }
      return originalFetch(input, { ...init, headers });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [slug]);

  return null;
}
