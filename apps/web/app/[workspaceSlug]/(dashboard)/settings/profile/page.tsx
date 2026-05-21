// Settings → Profile. Always available — user's own data, no permission
// gate beyond workspace membership (enforced by the parent layout's
// requireWorkspaceFromSlug call).

import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import ProfilePanel from "../../../../../components/settings/ProfilePanel";

export const metadata = { title: "Profile" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { userId } = await requireWorkspaceFromSlug(workspaceSlug);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  return (
    <div className="p-6 sm:p-8">
      <ProfilePanel initialName={user?.name ?? ""} email={user?.email ?? ""} />
    </div>
  );
}
