import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { demoGuard } from "../../../lib/demo";
import { defaultPageJson } from "../../../lib/default-page-json";
import { extractSlotsFromPageJson } from "../../../lib/page-templates/slots";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["OPTIN", "SALES", "CHECKOUT", "UPSELL", "DOWNSELL", "THANKYOU", "CUSTOM"]),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
});

// ─── GET /api/page-templates ──────────────────────────────────────────────────
// Query: ?type=OPTIN &status=active|disabled|all &search= &tag=foo&tag=bar
//        &page= &pageSize=
//
// `tag` filter accepts multiple values — returns templates that have ANY of
// the tags (overlap match). Use repeated query params, e.g. `?tag=saas&tag=premium`.

export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess("settings:page_templates:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const sp       = req.nextUrl.searchParams;
    const type     = sp.get("type") as any | null;
    const status   = sp.get("status") ?? "all";
    const search   = sp.get("search") ?? "";
    const tagList  = sp.getAll("tag").map((t) => t.trim()).filter(Boolean);
    const page     = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") ?? "25", 10)));

    const where: any = { workspaceId };
    if (type)              where.type     = type;
    if (status === "active")    where.isActive = true;
    if (status === "disabled")  where.isActive = false;
    if (search) where.name = { contains: search, mode: "insensitive" };
    if (tagList.length > 0) where.tags = { hasSome: tagList };

    const [total, templates] = await Promise.all([
      db.pageTemplate.count({ where }),
      db.pageTemplate.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        // Include pageJson so we can compute slot count, then strip it
        // before sending — clients only need the count, not the bytes.
        select: { id: true, name: true, description: true, thumbnailUrl: true, type: true, tags: true, isActive: true, createdAt: true, pageJson: true },
      }),
    ]);

    const items = templates.map(({ pageJson, ...rest }) => ({
      ...rest,
      slotCount: extractSlotsFromPageJson(pageJson).length,
    }));

    return ok({ items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (error) {
    return handleError(error);
  }
}

// ─── POST /api/page-templates ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("settings:page_templates:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const body = await req.json();
    const data = createSchema.parse(body);

    const template = await db.pageTemplate.create({
      data: {
        workspaceId,
        name: data.name,
        type: data.type,
        description: data.description ?? null,
        tags: data.tags ?? [],
        pageJson: defaultPageJson,
      },
      select: { id: true, name: true, type: true, tags: true, createdAt: true },
    });

    return ok(template, 201);
  } catch (error) {
    return handleError(error);
  }
}
