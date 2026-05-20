import { auth } from "../../lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@launchtic/database";

// Post-login resolver — picks the user's default workspace and redirects.
// session.workspaceSlug is gone, so we look up the user's oldest workspace
// membership from the DB instead. That workspace is treated as the "default
// landing target" for callers without a specific destination (post-login
// redirect, root /dashboard hit, etc.).

export const dynamic = "force-dynamic";

export default async function DashboardResolver() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.workspaceMember.findFirst({
    where: { userId: session.user.id as string },
    select: { workspace: { select: { slug: true } } },
    orderBy: { joinedAt: "asc" },
  });
  if (!membership) notFound();

  redirect(`/${membership.workspace.slug}/dashboard`);
}
