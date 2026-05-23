import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import MediaLibraryPanel from "../../../../../components/settings/MediaLibraryPanel";

export const metadata = { title: "Media Library" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await requireWorkspaceFromSlug(workspaceSlug, "media:read");

  return (
    <div className="p-6 sm:p-8">
      <MediaLibraryPanel />
    </div>
  );
}
