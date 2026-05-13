import { auth } from "../../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import ContactsClient from "../../../../components/contacts/ContactsClient";

export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const workspaceId = (session as any).workspaceId as string | null;
  if (!workspaceId) redirect("/login");

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
