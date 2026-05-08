import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError, getWorkspaceId } from "../../../lib/api";

const createFunnelSchema = z.object({
  name: z.string().min(1).max(100),
  currency: z.string().default("usd"),
});

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");
    const search = searchParams.get("search") ?? "";
    // status filter: ACTIVE (default — main list) or TRASHED (trash view).
    const statusParam = searchParams.get("status");
    const status: "ACTIVE" | "TRASHED" =
      statusParam === "TRASHED" ? "TRASHED" : "ACTIVE";
    const paginated = pageParam !== null || pageSizeParam !== null;

    const where = {
      workspaceId,
      status,
      ...(search && { name: { contains: search, mode: "insensitive" as const } }),
    };

    if (!paginated) {
      const funnels = await db.funnel.findMany({
        where,
        include: { steps: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
      });
      return ok(funnels);
    }

    const page = Math.max(1, parseInt(pageParam ?? "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam ?? "25")));

    const [items, total] = await Promise.all([
      db.funnel.findMany({
        where,
        include: {
          steps: { select: { id: true, slug: true }, orderBy: { order: "asc" } },
          domains: {
            include: { domain: { select: { domain: true, verified: true } } },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.funnel.count({ where }),
    ]);

    return ok({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const body = await req.json();
    const data = createFunnelSchema.parse(body);

    const funnel = await db.funnel.create({
      data: { ...data, workspaceId },
    });

    return ok(funnel, 201);
  } catch (error) {
    return handleError(error);
  }
}
