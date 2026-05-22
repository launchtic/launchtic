// Contact + tag management tools.

import { z } from "zod";
import { db } from "@launchtic/database";
import { defineTool, type ToolContext } from "./define";
import { findOrCreateTag, findOrSkipTag } from "./helpers";
import { resolveContactLabel, resolveTagLabel } from "./resolvers";

// ─── Reads ──────────────────────────────────────────────────────────────────

const listContacts = defineTool({
  name: "list_contacts",
  description: "Search contacts by email/name or list recent contacts.",
  inputSchema: z.object({
    search: z.string().optional().describe("Email or name substring (case-insensitive). Omit for recent contacts."),
    limit:  z.number().int().min(1).max(50).default(10),
  }),
  requiresConfirm: false,
  requiredPermission: "contacts:read",
  execute: async ({ search, limit }, ctx) => {
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId };
    if (search?.trim()) {
      where.OR = [
        { email:     { contains: search.trim(), mode: "insensitive" } },
        { firstName: { contains: search.trim(), mode: "insensitive" } },
        { lastName:  { contains: search.trim(), mode: "insensitive" } },
      ];
    }
    const contacts = await db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        unsubscribedAt: true, bouncedAt: true,
        tags: { select: { tag: { select: { name: true } } } },
      },
    });
    return {
      count: contacts.length,
      contacts: contacts.map((c) => ({
        id: c.id,
        email: c.email,
        name: [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
        tags: c.tags.map((t) => t.tag.name),
        status: c.unsubscribedAt ? "unsubscribed" : c.bouncedAt ? "bounced" : "active",
      })),
    };
  },
});

const listTags = defineTool({
  name: "list_tags",
  description: "List all tags in the workspace with usage counts. Use before creating a duplicate tag.",
  inputSchema: z.object({}),
  requiresConfirm: false,
  requiredPermission: "tags:read",
  execute: async (_args, ctx) => {
    const tags = await db.tag.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, color: true,
        _count: { select: { contacts: true } },
      },
    });
    return {
      count: tags.length,
      tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color, contactCount: t._count.contacts })),
    };
  },
});

// ─── Writes ─────────────────────────────────────────────────────────────────

const createTag = defineTool({
  name: "create_tag",
  description: "Create a new contact tag. Tag names must be unique within the workspace.",
  inputSchema: z.object({
    name:  z.string().min(1).max(60).describe("Tag name."),
    color: z.string().optional().describe("Optional hex color like #3b82f6."),
  }),
  requiresConfirm: true,
  requiredPermission: "tags:write",
  summary: (a) => `Create tag "${a.name}"${a.color ? ` (color ${a.color})` : ""}`,
  execute: async (args, ctx) => {
    const tag = await db.tag.create({
      data: { workspaceId: ctx.workspaceId, name: args.name.trim(), color: args.color || null },
    });
    return { id: tag.id, name: tag.name };
  },
});

const tagContact = defineTool({
  name: "tag_contact",
  description: "Add an existing tag to an existing contact. Look up tag and contact IDs first if you don't have them.",
  inputSchema: z.object({
    contactId: z.string().describe("Contact ID. Use list_contacts to find one."),
    tagId:     z.string().describe("Tag ID. Use list_tags to find one."),
  }),
  requiresConfirm: true,
  requiredPermission: "contacts:write",
  summary: async (a, ctx) => {
    const [contactLabel, tagLabel] = await Promise.all([
      resolveContactLabel(a.contactId, ctx),
      resolveTagLabel(a.tagId, ctx),
    ]);
    return `Add tag "${tagLabel}" to ${contactLabel}`;
  },
  execute: async (args, ctx) => {
    const contact = await db.contact.findFirst({
      where: { id: args.contactId, workspaceId: ctx.workspaceId },
      select: { id: true, email: true },
    });
    if (!contact) throw new Error("Contact not found");
    const tag = await db.tag.findFirst({
      where: { id: args.tagId, workspaceId: ctx.workspaceId },
      select: { id: true, name: true },
    });
    if (!tag) throw new Error("Tag not found");
    await db.contactTag.upsert({
      where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
      create: { contactId: contact.id, tagId: tag.id },
      update: {},
    });
    return { contact: contact.email, tag: tag.name, tagged: true };
  },
});

const untagContact = defineTool({
  name: "untag_contact",
  description: "Remove a tag from a contact.",
  inputSchema: z.object({
    contactId: z.string(),
    tagId:     z.string(),
  }),
  requiresConfirm: true,
  requiredPermission: "contacts:write",
  summary: async (a, ctx) => {
    const [contactLabel, tagLabel] = await Promise.all([
      resolveContactLabel(a.contactId, ctx),
      resolveTagLabel(a.tagId, ctx),
    ]);
    return `Remove tag "${tagLabel}" from ${contactLabel}`;
  },
  execute: async (args, ctx) => {
    const contact = await db.contact.findFirst({
      where: { id: args.contactId, workspaceId: ctx.workspaceId },
      select: { id: true, email: true },
    });
    if (!contact) throw new Error("Contact not found");
    await db.contactTag.deleteMany({
      where: { contactId: contact.id, tagId: args.tagId },
    });
    return { contact: contact.email, untagged: true };
  },
});

const createContact = defineTool({
  name: "create_contact",
  description: "Create a new contact (lead/customer). Email is required + must be unique within workspace.",
  inputSchema: z.object({
    email:     z.string().email(),
    firstName: z.string().optional(),
    lastName:  z.string().optional(),
    phone:     z.string().optional(),
    tagNames:  z.array(z.string()).optional().describe("Tags to add immediately. Auto-created if missing."),
  }),
  requiresConfirm: true,
  requiredPermission: "contacts:write",
  summary: (a) => {
    const name = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
    const tags = a.tagNames?.length ? ` with tag(s) ${a.tagNames.map((t) => `"${t}"`).join(", ")}` : "";
    return `Create contact ${name ? `${name} <${a.email}>` : a.email}${tags}`;
  },
  execute: async (args, ctx) => {
    return await db.$transaction(async (tx) => {
      const existing = await tx.contact.findFirst({
        where: { workspaceId: ctx.workspaceId, email: args.email },
        select: { id: true },
      });
      if (existing) throw new Error(`Contact ${args.email} already exists`);

      const contact = await tx.contact.create({
        data: {
          workspaceId: ctx.workspaceId,
          email: args.email,
          firstName: args.firstName ?? null,
          lastName: args.lastName ?? null,
          phone: args.phone ?? null,
        },
      });

      // Graceful skip: contact still gets created even if user lacks
      // tags:write — unresolvable tag names are surfaced in `skipped.tags`.
      const tagsCreated: string[] = [];
      const skippedTags: string[] = [];
      for (const tagName of args.tagNames ?? []) {
        const tagId = await findOrSkipTag(tagName, ctx);
        if (!tagId) {
          skippedTags.push(tagName.trim());
          continue;
        }
        await tx.contactTag.create({ data: { contactId: contact.id, tagId } });
        tagsCreated.push(tagName);
      }

      return {
        contactId: contact.id,
        email: contact.email,
        tagsApplied: tagsCreated,
        skipped: { tags: skippedTags },
      };
    });
  },
});

const updateContact = defineTool({
  name: "update_contact",
  description: "Update an existing contact's info. Only the fields you provide are changed; pass nothing for fields you want to keep.",
  inputSchema: z.object({
    contactId: z.string().describe("Contact ID. Use list_contacts to find."),
    email:     z.string().email().optional(),
    firstName: z.string().optional(),
    lastName:  z.string().optional(),
    phone:     z.string().optional(),
  }),
  requiresConfirm: true,
  requiredPermission: "contacts:write",
  summary: async (a, ctx) => {
    const c = await db.contact.findFirst({
      where: { id: a.contactId, workspaceId: ctx.workspaceId },
      select: { email: true },
    });
    const fields = [
      a.email && "email",
      a.firstName !== undefined && "firstName",
      a.lastName !== undefined && "lastName",
      a.phone !== undefined && "phone",
    ].filter(Boolean).join(", ");
    return `Update ${c?.email ?? a.contactId} (${fields || "no fields"})`;
  },
  execute: async (args, ctx) => {
    const contact = await db.contact.findFirst({
      where: { id: args.contactId, workspaceId: ctx.workspaceId },
      select: { id: true, email: true },
    });
    if (!contact) throw new Error("Contact not found");

    const data: Record<string, unknown> = {};
    if (args.email !== undefined)     data.email = args.email;
    if (args.firstName !== undefined) data.firstName = args.firstName || null;
    if (args.lastName !== undefined)  data.lastName = args.lastName || null;
    if (args.phone !== undefined)     data.phone = args.phone || null;

    const updated = await db.contact.update({ where: { id: contact.id }, data });
    return {
      contactId: updated.id,
      email: updated.email,
      updatedFields: Object.keys(data),
    };
  },
});

// Shared filter resolver — used by bulk_tag_contacts summary (count preview)
// + execute (apply). AND-combines filters into one Contact.findMany.
async function findBulkTagContactIds(
  args: { filter: { purchasedFrom?: string; purchasedTo?: string; hasTagName?: string; emailDomain?: string } },
  ctx: ToolContext,
): Promise<string[]> {
  const where: Record<string, unknown> = { workspaceId: ctx.workspaceId };
  if (args.filter.emailDomain) {
    where.email = { endsWith: `@${args.filter.emailDomain.replace(/^@/, "")}` };
  }
  if (args.filter.hasTagName) {
    const tag = await db.tag.findFirst({
      where: { workspaceId: ctx.workspaceId, name: { equals: args.filter.hasTagName, mode: "insensitive" } },
      select: { id: true },
    });
    if (!tag) return []; // missing tag → no matches
    where.tags = { some: { tagId: tag.id } };
  }
  if (args.filter.purchasedFrom || args.filter.purchasedTo) {
    const from = args.filter.purchasedFrom ? new Date(args.filter.purchasedFrom) : undefined;
    const to = args.filter.purchasedTo ? new Date(args.filter.purchasedTo) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    where.orders = {
      some: {
        status: "PAID",
        ...(from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}),
      },
    };
  }
  const contacts = await db.contact.findMany({ where, select: { id: true } });
  return contacts.map((c) => c.id);
}

const bulkTagContacts = defineTool({
  name: "bulk_tag_contacts",
  description:
    "Add a tag to multiple contacts at once based on a filter. " +
    "Useful for campaigns ('tag everyone who bought in July as july-buyer'). " +
    "Tag is auto-created if missing.",
  inputSchema: z.object({
    tagName: z.string().min(1).describe("Tag to add."),
    filter: z.object({
      purchasedFrom: z.string().optional().describe("ISO date (YYYY-MM-DD). Include contacts who bought on or after this."),
      purchasedTo:   z.string().optional().describe("ISO date (YYYY-MM-DD). Include contacts who bought on or before this."),
      hasTagName:    z.string().optional().describe("Include contacts who already have this tag."),
      emailDomain:   z.string().optional().describe("Filter by email domain, e.g. 'gmail.com'."),
    }).describe("At least one filter required."),
  }),
  requiresConfirm: true,
  requiredPermission: "contacts:write",
  summary: async (a, ctx) => {
    const ids = await findBulkTagContactIds(a, ctx);
    return `Add tag "${a.tagName}" to ${ids.length} contact(s) matching the filter`;
  },
  execute: async (args, ctx) => {
    const contactIds = await findBulkTagContactIds(args, ctx);
    if (contactIds.length === 0) return { taggedCount: 0, tagName: args.tagName };

    const tagId = await findOrCreateTag(args.tagName, ctx);
    const result = await db.contactTag.createMany({
      data: contactIds.map((contactId) => ({ contactId, tagId })),
      skipDuplicates: true,
    });
    return {
      tagName: args.tagName,
      matchedContacts: contactIds.length,
      newlyTagged: result.count,
      skippedAlreadyTagged: contactIds.length - result.count,
    };
  },
});

const deleteContact = defineTool({
  name: "delete_contact",
  description:
    "Permanently delete a contact and ALL their related rows (tags, events, sequence enrollments, orders, subscriptions). Irreversible. " +
    "Order/Subscription rows are CASCADED — financial history for this person is wiped. Prefer unsubscribing or removing tags instead unless the operator really wants to erase the record (e.g. GDPR delete request).",
  inputSchema: z.object({
    contactId: z.string().describe("Contact ID from list_contacts."),
  }),
  requiresConfirm: true,
  requiredPermission: "contacts:delete",
  summary: async (a, ctx) => {
    const contact = await db.contact.findFirst({
      where: { id: a.contactId, workspaceId: ctx.workspaceId },
      select: {
        email: true,
        _count: { select: { orders: true, subscriptions: true } },
      },
    });
    if (!contact) return `Delete contact ${a.contactId}`;
    const impact: string[] = [];
    if (contact._count.orders > 0)        impact.push(`${contact._count.orders} order(s)`);
    if (contact._count.subscriptions > 0) impact.push(`${contact._count.subscriptions} subscription(s)`);
    const tail = impact.length > 0 ? ` ⚠️ ALSO wipes ${impact.join(" + ")}` : "";
    return `Delete contact "${contact.email}"${tail}`;
  },
  execute: async (args, ctx) => {
    const contact = await db.contact.findFirst({
      where: { id: args.contactId, workspaceId: ctx.workspaceId },
      select: { id: true, email: true },
    });
    if (!contact) throw new Error("Contact not found");
    await db.contact.delete({ where: { id: contact.id } });
    return { deleted: true, email: contact.email };
  },
});

const deleteTag = defineTool({
  name: "delete_tag",
  description:
    "Permanently delete a tag. Removes the tag from every contact that has it (ContactTag rows cascade). The contact records themselves stay intact — only the tag-association rows are dropped.",
  inputSchema: z.object({
    tagId: z.string().describe("Tag ID from list_tags."),
  }),
  requiresConfirm: true,
  requiredPermission: "tags:delete",
  summary: async (a, ctx) => {
    const tag = await db.tag.findFirst({
      where: { id: a.tagId, workspaceId: ctx.workspaceId },
      select: { name: true, _count: { select: { contacts: true } } },
    });
    if (!tag) return `Delete tag ${a.tagId}`;
    const tail = tag._count.contacts > 0
      ? ` ⚠️ removes it from ${tag._count.contacts} contact(s)`
      : "";
    return `Delete tag "${tag.name}"${tail}`;
  },
  execute: async (args, ctx) => {
    const tag = await db.tag.findFirst({
      where: { id: args.tagId, workspaceId: ctx.workspaceId },
      select: { id: true, name: true },
    });
    if (!tag) throw new Error("Tag not found");
    await db.tag.delete({ where: { id: tag.id } });
    return { deleted: true, name: tag.name };
  },
});

export const contactTools = [
  listContacts,
  listTags,
  createTag,
  tagContact,
  untagContact,
  createContact,
  updateContact,
  bulkTagContacts,
  deleteContact,
  deleteTag,
];
