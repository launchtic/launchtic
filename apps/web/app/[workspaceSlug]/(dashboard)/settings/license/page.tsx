// LicensePanel fetches its own data via /api/license.

import { notFound } from "next/navigation";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import LicensePanel from "../../../../../components/settings/LicensePanel";
import VersionPanel from "../../../../../components/settings/VersionPanel";

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
    <div className="p-6 sm:p-8 space-y-10">
      <LicensePanel />
      <VersionPanel />
    </div>
  );
}
