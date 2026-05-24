import { notFound } from "next/navigation";
import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import StoragePanel from "../../../../../components/settings/StoragePanel";

export const metadata = { title: "Storage" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  // Storage is org-wide (shared by every workspace under this org) so we
  // gate the page to the org owner only. Admins-with-perm can still see
  // their workspace's content but not change infra config.
  const r = await requireWorkspaceFromSlug(workspaceSlug);
  if (!r.isOwner) notFound();

  const org = await db.organization.findUnique({
    where:  { id: r.organizationId },
    select: { storage: true },
  });
  const storage = org?.storage as any;

  // Count assets in this org grouped by their driver field — used by the
  // panel to warn the owner when a destructive config change would orphan
  // existing files (e.g. swapping S3 bucket, switching back to local).
  // Single grouped query — fast even with 100K+ assets.
  const counts = await db.asset.groupBy({
    by: ["driver"],
    where: { workspace: { organizationId: r.organizationId } },
    _count: { _all: true },
  });
  const assetCounts = {
    local: counts.find((c) => c.driver === "local")?._count._all ?? 0,
    s3:    counts.find((c) => c.driver === "s3")?._count._all    ?? 0,
  };

  return (
    <div className="p-6 sm:p-8">
      <StoragePanel
        initial={storage ? {
          driver:    storage.driver ?? "local",
          endpoint:  storage.endpoint  ?? "",
          region:    storage.region    ?? "",
          bucket:    storage.bucket    ?? "",
          accessKey: storage.accessKey ?? "",
          // Plaintext to owner — UI uses the password input + eye toggle to
          // hide-by-default. Same pattern as Stripe/AI keys. (We previously
          // tried masking with bullets but that string would get echoed back
          // to S3 signing and fail.)
          secretKey: storage.secretKey ?? "",
          publicUrl: storage.publicUrl  ?? "",
        } : null}
        assetCounts={assetCounts}
      />
    </div>
  );
}
