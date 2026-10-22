import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { demoGuard } from "../../../../../lib/demo";

type Params = { params: Promise<{ id: string }> };

// ─── POST /api/page-templates/:id/clone ──────────────────────────────────────

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("settings:page_templates:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;

    const source = await db.pageTemplate.findFirst({
      where: { id, workspaceId },
      select: { name: true, type: true, pageJson: true, meta: true },
    });
    if (!source) return err("Template not found", 404);

    const cloned = await db.pageTemplate.create({
      data: {
        workspaceId,
        name: nextCopyName(source.name),
        type: source.type,
        pageJson: source.pageJson ?? {},
        meta: (source.meta ?? {}) as any,
      },
      select: { id: true, name: true, thumbnailUrl: true, type: true, isActive: true, createdAt: true },
    });

    return ok(cloned, 201);
  } catch (error) {
    return handleError(error);
  }
}

function nextCopyName(name: string): string {
  const base = name.replace(/\s*\(Copy(?:\s*\d+)?\)\s*$/i, "").trim();
  return `${base} (Copy)`;
}
