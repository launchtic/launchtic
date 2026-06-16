import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
import EmailLabClient from "../../../../components/email-builder/EmailLabClient";

export const metadata = { title: "Email Lab" };
export const dynamic = "force-dynamic";

export default async function EmailLabPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  await requireWorkspaceFromSlug(workspaceSlug, "email_templates:read");
  return <div className="h-full min-h-0"><EmailLabClient /></div>;
}
