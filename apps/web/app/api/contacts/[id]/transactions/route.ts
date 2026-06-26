import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

const PAGE_SIZE = 20;

// Contact orders + their transactions, cursor-paginated.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:read");
    if (!r.ok) return r.response;

    const { id } = await params;
    const contact = await db.contact.findFirst({ where: { id, workspaceId: r.workspaceId }, select: { id: true } });
    if (!contact) return err("Contact not found", 404);

    const cursor = new URL(req.url).searchParams.get("cursor");

    const rows = await db.order.findMany({
      where: { contactId: id, workspaceId: r.workspaceId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, total: true, currency: true, status: true, createdAt: true,
        transactions: {
          select: { id: true, type: true, amount: true, currency: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    return ok({
      items: page.map((o) => ({
        id: o.id,
        total: o.total,
        currency: o.currency,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        transactions: o.transactions.map((t) => ({
          id: t.id, type: t.type, amount: t.amount, currency: t.currency,
          status: t.status, createdAt: t.createdAt.toISOString(),
        })),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    return handleError(error);
  }
}
