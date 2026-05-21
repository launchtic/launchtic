import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import { ensureDefaultDomain } from "../../../../../lib/domains/default-domain";
import DomainsPanel from "../../../../../components/settings/DomainsPanel";

export const metadata = { title: "Custom Domains" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "settings:domains:read");

  // Lazy-seed PAGES_DOMAIN as the workspace's default Domain on first visit.
  await ensureDefaultDomain(workspaceId);

  const domains = await db.domain.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const rendererUrl  = process.env.RENDERER_URL!;
  const rendererHost = new URL(rendererUrl).host;

  return (
    <div className="p-6 sm:p-8">
      <DomainsPanel
        initialDomains={domains.map((d) => ({
          id: d.id,
          domain: d.domain,
          verified: d.verified,
          isDefault: d.isDefault,
          createdAt: d.createdAt.toISOString(),
        }))}
        rendererHost={rendererHost}
      />
    </div>
  );
}
