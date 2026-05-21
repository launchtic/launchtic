// Settings layout — wraps all /settings/* sub-pages with a shared sidebar.
// No permission gate here (Profile is always accessible). Each sub-page
// performs its own gate via requireWorkspaceFromSlug(slug, "<perm>:read")
// — if denied, the page redirects to the in-workspace 403 page.

import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
import { getEffectivePlan } from "../../../../lib/organization";
import SettingsShell from "../../../../components/settings/SettingsShell";

export const metadata = { title: { template: "%s · Settings", default: "Settings" } };

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params:   Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  // Auth + membership check (notFound if not a member). No permission arg
  // because Profile sub-page is always accessible.
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug);

  // Plan drives proOnly/freeOnly filtering in the sidebar (Agency-tier
  // workspaces hide General; non-Agency hide Workspaces/Team/Roles).
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { organization: { select: { plan: true, licenseExpiresAt: true } } },
  });
  const workspacePlan = getEffectivePlan(ws?.organization);

  return (
    <SettingsShell workspaceSlug={workspaceSlug} workspacePlan={workspacePlan}>
      {children}
    </SettingsShell>
  );
}
