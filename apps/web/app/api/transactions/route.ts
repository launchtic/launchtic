import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const type   = searchParams.get("type");
    const status = searchParams.get("status");
    const cursor = searchParams.get("cursor");

    const where = {
      order: { workspaceId },
      ...(type && { type: type as any }),
      ...(status && { status: status as any }),
      ...(search && {
        OR: [
          { reference: { contains: search, mode: "insensitive" as const } },
          { order: { contact: { email:     { contains: search, mode: "insensitive" as const } } } },
          { order: { contact: { firstName: { contains: search, mode: "insensitive" as const } } } },
          { order: { contact: { lastName:  { contains: search, mode: "insensitive" as const } } } },
        ],
      }),
    };

    const rows = await db.transaction.findMany({
      where,
      include: {
        order: {
          select: {
            id: true, total: true, currency: true, paymentProvider: true,
            contact: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
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
