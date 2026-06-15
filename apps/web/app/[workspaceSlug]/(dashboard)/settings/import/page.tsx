import { notFound } from "next/navigation";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import ImportPanel from "../../../../../components/settings/ImportPanel";

export const metadata = { title: "Import" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  // Owner-only — importing creates page/email/funnel templates in the workspace.
  const r = await requireWorkspaceFromSlug(workspaceSlug);
  if (!r.isOwner) notFound();

  return (
    <div className="p-6 sm:p-8">
      <ImportPanel />
    </div>
  );
}
