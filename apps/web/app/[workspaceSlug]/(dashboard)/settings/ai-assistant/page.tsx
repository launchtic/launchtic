// AiAssistantPanel fetches its own data via /api/ai/settings.

import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import AiAssistantPanel from "../../../../../components/settings/AiAssistantPanel";

export const metadata = { title: "AI Assistant" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await requireWorkspaceFromSlug(workspaceSlug, "settings:ai:read");

  return (
    <div className="p-6 sm:p-8">
      <AiAssistantPanel />
    </div>
  );
}
