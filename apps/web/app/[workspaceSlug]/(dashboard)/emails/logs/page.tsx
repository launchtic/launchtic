import EmailLogsList from "../../../../../components/emails/EmailLogsList";

import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
export const metadata = { title: "Email Logs" };

export default async function EmailLogsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "email_logs:read");

  return <EmailLogsList />;
}
