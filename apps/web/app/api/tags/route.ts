import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess("tags:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { searchParams } = new URL(req.url);
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");
    const search = searchParams.get("search") ?? "";
    const paginated = pageParam !== null || pageSizeParam !== null;

    const where = {
      workspaceId,
      ...(search && { name: { contains: search, mode: "insensitive" as const } }),
    };

    if (!paginated) {
      const tags = await db.tag.findMany({
        where,
        include: { _count: { select: { contacts: true } } },
        orderBy: { name: "asc" },
      });
      return ok(tags);
    }

    const page = Math.max(1, parseInt(pageParam ?? "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam ?? "25")));

    const [items, total] = await Promise.all([
      db.tag.findMany({
        where,
        include: { _count: { select: { contacts: true } } },
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.tag.count({ where }),
    ]);

    return ok({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("tags:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const body = await req.json();
    const data = createTagSchema.parse(body);

    const existing = await db.tag.findUnique({
      where: { workspaceId_name: { workspaceId, name: data.name } },
    });
    if (existing) return err("A tag with this name already exists", 409);

    const tag = await db.tag.create({
      data: { ...data, workspaceId },
      include: { _count: { select: { contacts: true } } },
    });

    return ok(tag, 201);
  } catch (error) {
    return handleError(error);
  }
}
