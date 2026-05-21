"use client";

// Client shell around /settings/* pages. Owns the mobile "which view"
// state (nav vs content) — sidebar slides in/out on small screens.
//
// Server layout passes workspaceSlug + plan. Children = the active sub-page
// (Profile / General / Payment / etc.) which fetched its own data.

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import SettingsSidebar, { SettingsContent } from "./SettingsSidebar";

export default function SettingsShell({
  workspaceSlug,
  workspacePlan,
  children,
}: {
  workspaceSlug: string;
  workspacePlan: string;
  children:      React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileView, setMobileView] = useState<"nav" | "content">("content");

  // When the URL changes, show the content area (auto-close mobile nav).
  useEffect(() => {
    setMobileView("content");
  }, [pathname]);

  return (
    <div className="flex h-full overflow-hidden">
      <SettingsSidebar
        workspaceSlug={workspaceSlug}
        workspacePlan={workspacePlan}
        mobileView={mobileView}
        onSelect={() => setMobileView("content")}
      />
      <SettingsContent mobileView={mobileView}>
        {/* Mobile back-to-nav header */}
        <button
          onClick={() => setMobileView("nav")}
          className="md:hidden w-full flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
        >
          ← All settings
        </button>
        {children}
      </SettingsContent>
    </div>
  );
}
