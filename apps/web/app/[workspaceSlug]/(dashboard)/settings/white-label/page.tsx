import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import { getPlanFeatures } from "../../../../../lib/plan";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import { getBranding } from "../../../../../lib/branding";
import BrandingPanel from "../../../../../components/settings/BrandingPanel";

export const metadata = { title: "White Label" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  // White Label is an Organization-wide branding override, gated to the
  // founder (Organization.ownerId). We do NOT use a custom permission key
  // because white-label decisions are billing-tier-locked and identity-bound
  // — granting via role would let admins override the founder's brand.
  // The sidebar already hides this tab for non-Agency plans; the plan check
  // below is URL-hop defense (an owner who pastes the URL on a non-Agency plan
  // just gets redirected to /license rather than a useless empty editor).
  const { workspaceId, isOwner } = await requireWorkspaceFromSlug(workspaceSlug);
  if (!isOwner) redirect(`/${workspaceSlug}/forbidden?perm=owner_only`);

  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { organizationId: true, organization: { select: { plan: true } } },
  });
  if (!ws) return null;

  if (!getPlanFeatures(ws.organization.plan).whiteLabel) {
    redirect(`/${workspaceSlug}/settings/license`);
  }

  const branding = await getBranding(ws.organizationId);

  return (
    <div className="p-6 sm:p-8">
      <BrandingPanel initial={branding.raw} />
    </div>
  );
}
