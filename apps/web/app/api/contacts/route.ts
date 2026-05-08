import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError, getWorkspaceId } from "../../../lib/api";

const contactFields = {
  email:         z.string().email(),
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
};

const createContactSchema = z.object(contactFields);

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const tagId  = searchParams.get("tagId");
    const cursor = searchParams.get("cursor");

    const where = {
      workspaceId,
      ...(search && {
        OR: [
          { email:     { contains: search, mode: "insensitive" as const } },
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName:  { contains: search, mode: "insensitive" as const } },
          { company:   { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(tagId && { tags: { some: { tagId } } }),
    };

    const rows = await db.contact.findMany({
      where,
      include: { tags: { include: { tag: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return ok({ items, nextCursor });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const body = await req.json();
    const { email, ...rest } = createContactSchema.parse(body);

    const contact = await db.contact.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      update: rest,
      create: { workspaceId, email, ...rest },
      include: { tags: { include: { tag: true } } },
    });

    return ok(contact, 201);
  } catch (error) {
    return handleError(error);
  }
}
