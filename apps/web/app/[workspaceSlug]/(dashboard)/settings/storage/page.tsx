import { notFound } from "next/navigation";
import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import StoragePanel from "../../../../../components/settings/StoragePanel";

export const metadata = { title: "Storage" };

function maskKey(key: string): string {
  if (!key || key.length <= 8) return "••••••••";
  return key.slice(0, 8) + "••••••••" + key.slice(-4);
}

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

  return (
    <div className="p-6 sm:p-8">
      <StoragePanel
        initial={storage ? {
          driver:    storage.driver ?? "local",
          endpoint:  storage.endpoint  ?? "",
          region:    storage.region    ?? "",
          bucket:    storage.bucket    ?? "",
          accessKey: storage.accessKey ?? "",
          secretKey: storage.secretKey ? maskKey(storage.secretKey) : "",
          publicUrl: storage.publicUrl  ?? "",
        } : null}
      />
    </div>
  );
}
