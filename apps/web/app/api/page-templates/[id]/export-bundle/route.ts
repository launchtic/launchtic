import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { encodeBundle } from "../../../../../lib/template-bundle";
import { collectExportableAssets } from "../../../../../lib/asset-export";

function safeFilename(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "template";
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-${date}.ltbundle`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("settings:page_templates:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;

    const tpl = await db.pageTemplate.findFirst({
      where:  { id, workspaceId },
      select: {
        name: true, type: true,
        pageJson: true, meta: true, thumbnailUrl: true,
      },
    });
    if (!tpl) return err("Page template not found", 404);

    const assets = await collectExportableAssets(workspaceId, [tpl.pageJson, tpl.meta, tpl.thumbnailUrl ?? ""]);

    const bundle = encodeBundle({
      kind: "page",
      template: {
        name:         tpl.name,
        type:         tpl.type,
        pageJson:     tpl.pageJson,
        meta:         tpl.meta,
        thumbnailUrl: tpl.thumbnailUrl,
      },
      assets,
    });

    return new NextResponse(new Uint8Array(bundle), {
      headers: {
        "Content-Type":        "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeFilename(tpl.name)}"`,
        "Content-Length":      String(bundle.length),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
