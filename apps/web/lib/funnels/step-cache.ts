import { db } from "@launchtic/database";

const rendererUrl = () => process.env.RENDERER_INTERNAL_URL ?? "http://renderer:3001";

async function fanOut(targets: Array<{ domain: string }>, slugs: string[]): Promise<void> {
  await Promise.all(
    targets.flatMap(({ domain }) =>
      slugs.map((slug) =>
        fetch(`${rendererUrl()}/api/cache/invalidate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, slug }),
        }).catch(() => {}),
      ),
    ),
  );
}

// Invalidate the renderer's cached published page for a funnel step across all
// of the workspace's domains. Call after ANY change that affects what the
// published page serves — pageJson, price plans, offer type, coupons, bumps.
// Best-effort: failures never block the builder mutation.
export async function invalidateStepCache(workspaceId: string, funnelStepId: string): Promise<void> {
  try {
    const [domains, step] = await Promise.all([
      db.domain.findMany({ where: { workspaceId }, select: { domain: true } }),
      db.funnelStep.findUnique({ where: { id: funnelStepId }, select: { slug: true } }),
    ]);
    if (!step) return;
    const targets = domains.length > 0 ? domains : [{ domain: "localhost:3001" }];
    await fanOut(targets, [step.slug]);
  } catch {
    /* non-critical */
  }
}

// Workspace-wide invalidation — for changes that affect EVERY published page
// (payment provider keys embedded in pageJson, brand assets, fonts, etc.).
// Walks all funnel steps for the workspace and fans out to every domain.
export async function invalidateAllPagesForWorkspace(workspaceId: string): Promise<void> {
  try {
    const [domains, steps] = await Promise.all([
      db.domain.findMany({ where: { workspaceId }, select: { domain: true } }),
      db.funnelStep.findMany({
        where: { funnel: { workspaceId } },
        select: { slug: true },
      }),
    ]);
    if (steps.length === 0) return;
    const targets = domains.length > 0 ? domains : [{ domain: "localhost:3001" }];
    await fanOut(targets, steps.map((s) => s.slug));
  } catch {
    /* non-critical */
  }
}
