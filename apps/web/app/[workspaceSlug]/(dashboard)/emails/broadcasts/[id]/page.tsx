import { redirect } from "next/navigation";

// Editor moved to a full-screen route outside the dashboard chrome.
export default async function LegacyBroadcastPage({ params }: { params: Promise<{ id: string; workspaceSlug: string }> }) {
  const { workspaceSlug, id } = await params;
  redirect(`/${workspaceSlug}/broadcast-editor/${id}`);
}
