"use client";

// Thin client wrapper that performs the SSR-skipping dynamic import of
// EditorApp. Lives in its own file so the page can stay a server component
// (and read RENDERER_URL from process.env at runtime instead of relying on
// build-time NEXT_PUBLIC_*).

import dynamic from "next/dynamic";

const EditorApp = dynamic(
  () => import("@launchtic/elements").then((m) => ({ default: m.EditorApp })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen text-sm text-gray-400">
        Loading editor...
      </div>
    ),
  },
);

export default function EditorAppDynamic(props: {
  funnelStepId:  string;
  rendererUrl:   string;
  workspaceSlug: string;
  // White-label props forwarded from the editor page (server-resolved from
  // Organization.brandingConfig). Editor's Header reads window.data.brandLogoUrl
  // — see launchtic-elements/src/editor/app/Header.tsx.
  brandLogoUrl?: string | null;
  brandName?:    string | null;
}) {
  return <EditorApp {...(props as any)} />;
}
