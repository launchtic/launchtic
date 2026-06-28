import { notFound } from "next/navigation";
import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import { getRendererUrl } from "../../../../../lib/system-config";
import { getOrganizationForWorkspace, getEffectivePlan } from "../../../../../lib/organization";
import { getPlanFeatures } from "../../../../../lib/plan";
import FunnelStepManager from "../../../../../components/funnels/FunnelStepManager";

type Params = { params: Promise<{ id: string; workspaceSlug: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const funnel = await db.funnel.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: funnel?.name ?? "Funnel" };
}

export default async function FunnelDetailPage({ params }: Params) {
  const { id, workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "funnels:read");

  const funnel = await db.funnel.findUnique({
    where: { id, workspaceId },
    include: {
      steps: { orderBy: { order: "asc" } },
      domains: {
        include: { domain: { select: { domain: true, verified: true } } },
        take: 1,
      },
    },
  });

  if (!funnel) notFound();

  // A step is "empty" until a template is applied or content is built — its
  // pageJson is still the default canvas (ROOT with no child nodes). Drives
  // the inline template picker in the step panel. pageJson itself is heavy
  // (full Craft.js tree) so we compute the flag server-side and don't ship it.
  const stepHasContent = (pageJson: unknown): boolean => {
    const root = (pageJson as { ROOT?: { nodes?: unknown[] } } | null)?.ROOT;
    return Array.isArray(root?.nodes) && root.nodes.length > 0;
  };

  const steps = funnel.steps.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    type: s.type,
    order: s.order,
    acceptStepId: s.acceptStepId,
    declineStepId: s.declineStepId,
    hasContent: stepHasContent(s.pageJson),
  }));

  const primaryDomain = funnel.domains[0]?.domain.verified
    ? funnel.domains[0].domain.domain
    : null;

  const rendererUrl = await getRendererUrl();

  // Gate the Analytics + A/B tabs by their respective plan features (Starter+).
  const org = await getOrganizationForWorkspace(workspaceId);
  const features = getPlanFeatures(getEffectivePlan(org));

  return (
    <FunnelStepManager
      funnel={{ id: funnel.id, name: funnel.name, primaryDomain }}
      initialSteps={steps}
      rendererUrl={rendererUrl}
      canViewAnalytics={features.funnelAnalytics}
      canAbTest={features.abTesting}
      canUpsell={features.upsells}
    />
  );
}
