import { redirect } from "next/navigation";

// Editor moved to a full-screen route outside the dashboard chrome.
export default async function LegacyNewPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string }>;
}) {
  const { workspaceSlug, id } = await params;
  redirect(`/${workspaceSlug}/workflow-email-editor/${id}/new`);
}
