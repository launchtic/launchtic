import { auth } from "../../lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardResolver() {
  const session = await auth();
  if (!session) redirect("/login");
  const workspaceSlug = (session as any).workspaceSlug as string | null;
  if (!workspaceSlug) redirect("/login");
  redirect(`/${workspaceSlug}/dashboard`);
}
