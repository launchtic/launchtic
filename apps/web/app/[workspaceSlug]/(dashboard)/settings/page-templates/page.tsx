// PageTemplatesPanel fetches its own data + renders a full-bleed list UI.
// Drop the standard p-6 padding so the panel can manage its own layout.

import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import PageTemplatesPanel from "../../../../../components/settings/PageTemplatesPanel";

export const metadata = { title: "Page Templates" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await requireWorkspaceFromSlug(workspaceSlug, "settings:page_templates:read");

  return (
    <div className="flex-1 overflow-hidden h-full">
      <PageTemplatesPanel />
    </div>
  );
}
