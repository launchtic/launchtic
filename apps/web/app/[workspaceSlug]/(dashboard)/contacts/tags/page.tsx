import { db } from "@launchtic/database";
import TagsManager from "../../../../../components/contacts/TagsManager";

import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
export const metadata = { title: "Tags" };

export default async function TagsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug);

  const total = await db.tag.count({ where: { workspaceId } });

  return <TagsManager initialTotal={total} />;
}
