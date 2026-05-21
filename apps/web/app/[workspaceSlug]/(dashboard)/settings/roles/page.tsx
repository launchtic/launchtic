// RolesPanel fetches its own data via /api/roles — no server props needed.

import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import RolesPanel from "../../../../../components/settings/RolesPanel";

export const metadata = { title: "Roles" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await requireWorkspaceFromSlug(workspaceSlug, "roles:read");

  return (
    <div className="p-6 sm:p-8">
      <RolesPanel />
    </div>
  );
}
