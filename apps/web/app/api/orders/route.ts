import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess("orders:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status");
    const kind   = searchParams.get("kind"); // "subscription" | "renewal" | "one_time" | null
    const cursor = searchParams.get("cursor");

    const where = {
      workspaceId,
      // Top-level list shows main step orders only. Upsell/downsell children
      // come along inline via `include.children` and the UI renders them as
      // expandable rows under their parent.
      parentOrderId: null,
      ...(status && { status: status as any }),
      ...(kind === "subscription" && { subscriptionId: { not: null }, isRenewal: false }),
      ...(kind === "renewal" && { isRenewal: true }),
      ...(kind === "one_time" && { subscriptionId: null }),
      ...(search && {
        OR: [
          { contact: { email:     { contains: search, mode: "insensitive" as const } } },
          { contact: { firstName: { contains: search, mode: "insensitive" as const } } },
          { contact: { lastName:  { contains: search, mode: "insensitive" as const } } },
          { providerOrderId:      { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const childInclude = {
      contact:      { select: { id: true, email: true, firstName: true, lastName: true } },
      funnelStep:   { include: { funnel: { select: { name: true } } } },
      subscription: { select: { id: true, status: true, trialEnd: true } },
      _count:       { select: { transactions: true } },
    };

    const rows = await db.order.findMany({
      where,
      include: {
        ...childInclude,
        children: { include: childInclude, orderBy: { createdAt: "asc" } },
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
