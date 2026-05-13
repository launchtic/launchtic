import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { extractSlots } from "../../../lib/page-templates/slots";

const tagSchema = z
  .array(z.string().trim().min(1).max(30))
  .max(10)
  .transform((arr) => Array.from(new Set(arr.map((t) => t.toLowerCase()))));

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["section", "row"]),
  tags: tagSchema.optional(),
  contentJson: z.any(),
});

// GET /api/saved-blocks?kind=section|row&tag=hero
export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const sp = req.nextUrl.searchParams;
    const kind = sp.get("kind");
    const tag = sp.get("tag")?.trim().toLowerCase();

    const where: any = { workspaceId };
    if (kind === "section" || kind === "row") where.kind = kind;
    if (tag) where.tags = { has: tag };

    const rows = await db.savedBlock.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        kind: true,
        tags: true,
        contentJson: true,  // needed for slot count — stripped from response below
        createdAt: true,
        updatedAt: true,
      },
    });

    // Compute slot count per block (so the template-builder UI can show
    // "🪄 N slots" badge without an extra round trip). Strip contentJson
    // from the response — clients fetch it via /api/saved-blocks/[id].
    const items = rows.map((r) => {
      const { contentJson, ...rest } = r;
      return { ...rest, slotCount: extractSlots(contentJson).length };
    });

    // Compute tag counts across the whole workspace (ignore current `tag`
    // filter so the chip row stays stable while a filter is active).
    const allForCounts = await db.savedBlock.findMany({
      where: { workspaceId, ...(kind === "section" || kind === "row" ? { kind } : {}) },
      select: { tags: true },
    });
    const tagCounts: Record<string, number> = {};
    for (const b of allForCounts) {
      for (const t of b.tags) {
        tagCounts[t] = (tagCounts[t] ?? 0) + 1;
      }
    }

    return ok({ items, tagCounts });
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/saved-blocks  body: { name, kind, tags?, contentJson }
export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const body = await req.json();
    const data = createSchema.parse(body);

    const block = await db.savedBlock.create({
      data: {
        workspaceId,
        name: data.name,
        kind: data.kind,
        tags: data.tags ?? [],
        contentJson: data.contentJson,
      },
      select: { id: true, name: true, kind: true, tags: true, createdAt: true },
    });

    return ok(block, 201);
  } catch (error) {
    return handleError(error);
  }
}
