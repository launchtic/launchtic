// RolesPanel fetches its own data via /api/roles — no server props needed.

import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import { getEffectivePlan } from "../../../../../lib/organization";
import { isPaidPlan } from "../../../../../lib/plan";
import RolesPanel from "../../../../../components/settings/RolesPanel";

export const metadata = { title: "Roles" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "roles:read");

  // Plan gate (URL-hop defense). Sidebar hides this tab on Community.
  const planRow = await db.workspace.findUnique({
    where:  { id: workspaceId },
    select: { organization: { select: { plan: true, licenseExpiresAt: true } } },
  });
  if (!isPaidPlan(getEffectivePlan(planRow?.organization))) {
    redirect(`/${workspaceSlug}/settings/license`);
  }

  return (
    <div className="p-6 sm:p-8">
      <RolesPanel />
    </div>
  );
}
