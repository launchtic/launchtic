import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const updateContactSchema = z.object({
  firstName:     z.string().optional(),
  lastName:      z.string().optional(),
  phone:         z.string().optional(),
  country:       z.string().optional(),
  streetAddress: z.string().optional(),
  streetNumber:  z.string().optional(),
  neighborhood:  z.string().optional(),
  postalCode:    z.string().optional(),
  city:          z.string().optional(),
  state:         z.string().optional(),
  company:       z.string().optional(),
  taxNumber:     z.string().optional(),
  language:      z.string().optional(),
  customFields:  z.record(z.string()).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;

    const contact = await db.contact.findFirst({
      where: { id, workspaceId },
      include: {
        tags: { include: { tag: true } },
        events: { orderBy: { createdAt: "desc" }, take: 30 },
        _count: { select: { orders: true } },
      },
    });

    if (!contact) return err("Contact not found", 404);

    return ok(contact);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;

    const existing = await db.contact.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Contact not found", 404);

    const body = await req.json();
    const data = updateContactSchema.parse(body);

    const contact = await db.contact.update({
      where: { id },
      data,
      include: { tags: { include: { tag: true } } },
    });

    return ok(contact);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:delete");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;

    const existing = await db.contact.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Contact not found", 404);

    await db.contact.delete({ where: { id } });

    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
