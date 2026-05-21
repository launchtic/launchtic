import { auth } from "../../lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@launchtic/database";
import WorkspaceFetchHeader from "../../components/WorkspaceFetchHeader";

// redirect is used only for the unauthenticated → /login case; notFound
// handles invalid slugs without picking an arbitrary fallback workspace.

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { workspaceSlug } = await params;
  const userId = session.user?.id as string;

  // Validate the URL slug points at a workspace the user belongs to. Without
  // this check, arbitrary slugs render the UI for the user's real workspace
  // (backend queries use session.workspaceId, not the URL) — confusing and
  // breaks anything that reads useParams().workspaceSlug. Covers all routes
  // under [workspaceSlug]/* (dashboard, editor, page-template-editor, ...).
  //
  // We deliberately 404 rather than redirect to the user's "real" workspace:
  //   - Multi-workspace (Agency): redirecting picks an arbitrary one and the
  //     user may not realize they're now in a different workspace — risk of
  //     editing wrong data.
  //   - Single-workspace (Community/Pro): typo → 404 is clearer than silent
  //     redirect; the 404 page links back to dashboard.
  //   - Post-login routing to the user's actual workspace is handled in the
  //     auth callback, not here.
  // Reachable workspaces: owned via Organization OR explicitly a member.
  // Org owners don't have a WorkspaceMember row (they bypass permissions
  // via Organization.ownerId), so a member-only check would 404 them.
  const workspace = await db.workspace.findFirst({
    where: {
      slug: workspaceSlug,
      OR: [
        { organization: { ownerId: userId } },
        { members: { some: { userId } } },
      ],
    },
    select: { id: true },
  });
  if (!workspace) notFound();

  return (
    <>
      <WorkspaceFetchHeader slug={workspaceSlug} />
      {children}
    </>
  );
}
