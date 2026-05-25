import { auth } from "../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";

// Post-login resolver — picks the user's default workspace and redirects.
// session.workspaceSlug is gone, so we look up the user's first workspace
// directly: any workspace they own via the Organization OR are explicitly
// invited to. That oldest workspace is the "default landing target" for
// callers without a specific destination (post-login redirect, root
// /dashboard hit, etc.).
//
// We can't use WorkspaceMember alone — the Organization owner doesn't have
// a WorkspaceMember row (they bypass permissions via Organization.ownerId).

export const dynamic = "force-dynamic";

export default async function DashboardResolver() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id as string;

  const workspace = await db.workspace.findFirst({
    where: {
      OR: [
        { organization: { ownerId: userId } },
        { members: { some: { userId } } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { slug: true },
  });
  // No workspace = stale session referencing a User that was wiped (common
  // in dev when the DB gets reset). Send them back to login instead of a
  // dead-end 404 — login server-renders a fresh form against the current DB.
  if (!workspace) redirect("/login");

  redirect(`/${workspace.slug}/dashboard`);
}
