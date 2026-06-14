// LicensePanel fetches its own data via /api/license.

import { notFound } from "next/navigation";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import LicensePanel from "../../../../../components/settings/LicensePanel";
import VersionPanel from "../../../../../components/settings/VersionPanel";
import LicenseRefreshButton from "../../../../../components/settings/LicenseRefreshButton";

export const metadata = { title: "License" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const r = await requireWorkspaceFromSlug(workspaceSlug);
  if (!r.isOwner) notFound();

  return (
    <div className="p-6 sm:p-8 max-w-2xl space-y-10">
      <LicensePanel />
      <VersionPanel />
      <div className="pt-6 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500">
          Re-check your plan, update window, and latest version with launchtic.com.
        </p>
        <LicenseRefreshButton />
      </div>
    </div>
  );
}
