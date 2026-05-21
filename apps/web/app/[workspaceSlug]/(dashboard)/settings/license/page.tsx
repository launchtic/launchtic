// LicensePanel fetches its own data via /api/license.

import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import LicensePanel from "../../../../../components/settings/LicensePanel";

export const metadata = { title: "License" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await requireWorkspaceFromSlug(workspaceSlug, "billing:manage");

  return (
    <div className="p-6 sm:p-8">
      <LicensePanel />
    </div>
  );
}
