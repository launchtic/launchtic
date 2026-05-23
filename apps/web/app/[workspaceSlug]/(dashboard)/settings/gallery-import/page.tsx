import { notFound } from "next/navigation";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import GalleryImportPanel from "../../../../../components/settings/GalleryImportPanel";

export const metadata = { title: "Template Gallery" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const r = await requireWorkspaceFromSlug(workspaceSlug);
  if (!r.isOwner) notFound();

  return <GalleryImportPanel workspaceSlug={workspaceSlug} />;
}
