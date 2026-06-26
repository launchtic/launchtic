import { notFound } from "next/navigation";
import { db, EventType } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import ContactDetail from "../../../../../components/contacts/ContactDetail";

type Params = { params: Promise<{ id: string; workspaceSlug: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const contact = await db.contact.findUnique({
    where: { id },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!contact) return { title: "Contact" };
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return { title: fullName || contact.email };
}

export default async function ContactDetailPage({ params }: Params) {
  const { id, workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "contacts:read");

  // Tab rows are lazy-loaded per tab (see ContactActivityPanel); here we only
  // load the contact, tags, and cheap counts for the tab badges.
  const [contact, tags, eventCount, tagEventCount, workflowRunCount] = await Promise.all([
    db.contact.findFirst({
      where: { id, workspaceId },
      include: {
        tags: { include: { tag: true }, orderBy: { addedAt: "desc" } },
        _count: { select: { orders: true } },
      },
    }),
    db.tag.findMany({ where: { workspaceId }, orderBy: { name: "asc" } }),
    db.contactEvent.count({ where: { contactId: id } }),
    db.contactEvent.count({ where: { contactId: id, type: { in: [EventType.TAG_ADDED, EventType.TAG_REMOVED] } } }),
    db.workflowRun.count({ where: { contactId: id, workspaceId } }),
  ]);

  if (!contact) notFound();

  const serialized = {
    id: contact.id,
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    country: contact.country,
    createdAt: contact.createdAt.toISOString(),
    tags: contact.tags.map((ct) => ({
      addedAt: ct.addedAt.toISOString(),
      tag: { id: ct.tag.id, name: ct.tag.name, color: ct.tag.color },
    })),
    _count: contact._count,
  };

  const serializedTags = tags.map((t) => ({ id: t.id, name: t.name, color: t.color }));

  const counts = {
    activity: eventCount,
    transactions: contact._count.orders,
    tags: tagEventCount,
    workflows: workflowRunCount,
  };

  return <ContactDetail contact={serialized} allTags={serializedTags} counts={counts} />;
}
