import { auth } from "../../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import TagsManager from "../../../../../components/contacts/TagsManager";

export const metadata = { title: "Tags" };

export default async function TagsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

  const total = await db.tag.count({ where: { workspaceId } });

  return <TagsManager initialTotal={total} />;
}
