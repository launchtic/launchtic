import { auth } from "../../../../../lib/auth";
import { redirect } from "next/navigation";
import EmailLogsList from "../../../../../components/emails/EmailLogsList";

export const metadata = { title: "Email Logs" };

export default async function EmailLogsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

  return <EmailLogsList />;
}
