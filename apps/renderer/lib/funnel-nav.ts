import { db } from "@launchtic/database";

// Build an absolute URL to a funnel step's published page on the current host.
function stepUrl(slug: string, host: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.");
  const protocol = isDev || isLocal ? "http" : "https";
  return `${protocol}://${host}/${slug}`;
}

// The next step by `order` — the linear default when no explicit branch is set.
export async function getNextStepUrl(funnelStepId: string, host: string): Promise<string | null> {
  const current = await db.funnelStep.findUnique({
    where: { id: funnelStepId },
    select: { funnelId: true, order: true },
  });
  if (!current) return null;
  const next = await db.funnelStep.findFirst({
    where: { funnelId: current.funnelId, order: { gt: current.order } },
    orderBy: { order: "asc" },
    select: { slug: true },
  });
  return next ? stepUrl(next.slug, host) : null;
}

// Where an UPSELL/DOWNSELL step routes after the visitor accepts (buys) or
// declines. Uses the explicit branch target when set + still valid; otherwise
// falls back to the next step by order.
export async function getBranchUrl(
  step: { id: string; funnelId: string; acceptStepId: string | null; declineStepId: string | null },
  outcome: "accept" | "decline",
  host: string,
): Promise<string | null> {
  const targetId = outcome === "accept" ? step.acceptStepId : step.declineStepId;
  if (targetId) {
    const target = await db.funnelStep.findFirst({
      where: { id: targetId, funnelId: step.funnelId },
      select: { slug: true },
    });
    if (target) return stepUrl(target.slug, host);
  }
  return getNextStepUrl(step.id, host);
}
