import { redirect } from "next/navigation";

// Editor moved to a full-screen route outside the dashboard chrome.
export default async function LegacyEditPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string; emailId: string }>;
}) {
  const { workspaceSlug, id, emailId } = await params;
  redirect(`/${workspaceSlug}/workflow-email-editor/${id}/${emailId}`);
}
