import { redirect } from "next/navigation";

// Email templates moved to Settings. Keep this path working for old links/bookmarks.
export default async function LegacyEmailTemplatesPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  redirect(`/${workspaceSlug}/settings/email-templates`);
}
