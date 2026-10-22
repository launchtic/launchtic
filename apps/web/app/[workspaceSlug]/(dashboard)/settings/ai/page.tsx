// AiSettingsPanel fetches its own data via /api/ai/settings.

import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import AiSettingsPanel from "../../../../../components/settings/AiSettingsPanel";

export const metadata = { title: "AI" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await requireWorkspaceFromSlug(workspaceSlug, "settings:ai:read");

  return (
    <div className="p-6 sm:p-8">
      <AiSettingsPanel />
    </div>
  );
}
