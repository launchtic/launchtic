import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string; workspaceSlug: string }> };

// The email template editor moved to a full-screen route outside the dashboard
// chrome. Keep this path working for old links/bookmarks.
export default async function LegacyEditTemplatePage({ params }: PageProps) {
  const { id, workspaceSlug } = await params;
  redirect(`/${workspaceSlug}/email-template-editor/${id}`);
}
