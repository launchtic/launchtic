import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import { decrypt } from "../../../../../lib/crypto";
import StoragePanel from "../../../../../components/settings/StoragePanel";

export const metadata = { title: "Storage" };

function maskKey(key: string): string {
  if (!key || key.length <= 8) return "••••••••";
  return key.slice(0, 8) + "••••••••" + key.slice(-4);
}

function safeDecrypt(enc: string): string {
  if (!enc) return "";
  try { return decrypt(enc); } catch { return ""; }
}

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "settings:storage:read");

  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
  const storage = settings?.storage as any;

  return (
    <div className="p-6 sm:p-8">
      <StoragePanel
        initial={storage ? {
          driver:    storage.driver ?? "local",
          endpoint:  storage.endpoint  ?? "",
          region:    storage.region    ?? "",
          bucket:    storage.bucket    ?? "",
          accessKey: storage.accessKey ?? "",
          secretKey: storage.secretKeyEnc ? maskKey(safeDecrypt(storage.secretKeyEnc)) : "",
          publicUrl: storage.publicUrl  ?? "",
        } : null}
      />
    </div>
  );
}
