// /emails landing — no real content. Bounce to the first sub-tab the viewer
// has access to. Templates is the most universally accessible (Viewer can
// read templates), so default there. If they lack email_templates:read the
// targeted page itself 404s and the user falls back to the dashboard.
//
// The redirect MUST include the workspace slug — previously this used a
// root-relative path `/emails/templates` which dropped the workspace prefix
// and broke routing.

import { redirect } from "next/navigation";

export default async function EmailsIndex({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  redirect(`/${workspaceSlug}/settings/email-templates`);
}
