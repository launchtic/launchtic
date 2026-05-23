import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { encodeBundle } from "../../../../../lib/template-bundle";
import { collectExportableAssets } from "../../../../../lib/asset-export";

function safeFilename(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "funnel";
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-${date}.ltbundle`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("funnels:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;

    const funnel = await db.funnel.findFirst({
      where:   { id, workspaceId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!funnel) return err("Funnel not found", 404);

    // All step pageJson trees + funnel-level fields contribute references.
    const contents = [
      ...funnel.steps.map((s) => s.pageJson),
      ...funnel.steps.map((s) => s.meta ?? {}),
    ];
    const assets = await collectExportableAssets(workspaceId, contents);

    const bundle = encodeBundle({
      kind: "funnel",
      template: {
        name:     funnel.name,
        currency: funnel.currency,
        favicon:  funnel.favicon,
        steps:    funnel.steps.map((s) => ({
          name:     s.name,
          slug:     s.slug,
          type:     s.type,
          order:    s.order,
          pageJson: s.pageJson,
          meta:     s.meta,
        })),
      },
      assets,
    });

    return new NextResponse(new Uint8Array(bundle), {
      headers: {
        "Content-Type":        "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeFilename(funnel.name)}"`,
        "Content-Length":      String(bundle.length),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
