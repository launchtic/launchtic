import { db } from "@launchtic/database";
import ContactsClient from "../../../../components/contacts/ContactsClient";

import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
export const metadata = { title: "Contacts" };

export default async function ContactsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug);

  const [totalContacts, tags] = await Promise.all([
    db.contact.count({ where: { workspaceId } }),
    db.tag.findMany({
      where: { workspaceId },
      include: { _count: { select: { contacts: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const serializedTags = tags.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    count: t._count.contacts,
  }));

  return (
    <div className="flex flex-col h-full">
      <ContactsClient allTags={serializedTags} initialTotal={totalContacts} />
    </div>
  );
}
