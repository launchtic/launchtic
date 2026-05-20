import Link from "next/link";
import { auth } from "../lib/auth";
import { db } from "@launchtic/database";

// Global 404 for the admin app. Triggered by:
//   - Next's automatic 404 (unmatched route)
//   - notFound() calls from server components — most notably
//     [workspaceSlug]/layout when the URL slug doesn't belong to the user.
//
// We resolve the user's actual workspace slug so the "Back" link goes
// somewhere useful instead of dumping them at /login.
export default async function NotFound() {
  const session = await auth();
  let dashboardHref = "/login";

  if (session?.user?.id) {
    const member = await db.workspaceMember.findFirst({
      where: { userId: session.user.id as string },
      select: { workspace: { select: { slug: true } } },
      orderBy: { joinedAt: "asc" },
    });
    if (member?.workspace.slug) {
      dashboardHref = `/${member.workspace.slug}/dashboard`;
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-md">
        <p className="text-sm font-semibold text-blue-600 tracking-wider uppercase mb-3">404</p>
        <h1 className="text-3xl font-bold text-gray-900 mb-3 tracking-tight">
          Page not found
        </h1>
        <p className="text-gray-500 mb-8 leading-relaxed">
          The URL you tried doesn&apos;t belong to your account, or the page no longer exists.
        </p>
        <Link
          href={dashboardHref}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          {session ? "Back to dashboard" : "Sign in"}
        </Link>
      </div>
    </main>
  );
}
