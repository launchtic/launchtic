import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { importSystemeUrl } from "../../../../lib/sysio-import";

const schema = z.object({
  url:  z.string().url(),
  name: z.string().min(1).max(100).optional(),
  type: z.enum(["OPTIN", "SALES", "CHECKOUT", "UPSELL", "DOWNSELL", "THANKYOU", "CUSTOM"]).default("CUSTOM"),
});

// POST /api/page-templates/import-systeme
// Fetches a published systeme.io page, converts it to our Craft.js pageJson,
// and creates a PageTemplate in the workspace. Returns the new id + any
// elements that couldn't be auto-imported (warnings).
export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("settings:page_templates:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { url, name, type } = schema.parse(await req.json());

    let result;
    try {
      result = await importSystemeUrl(url);
    } catch (e) {
      return err(e instanceof Error ? e.message : "Import failed", 400);
    }

    const template = await db.pageTemplate.create({
      data: {
        workspaceId,
        name: name?.trim() || result.name,
        type,
        description: "Imported from systeme.io",
        pageJson: result.pageJson as unknown as object,
      },
      select: { id: true, name: true, type: true, createdAt: true },
    });

    return ok(
      { id: template.id, name: template.name, nodeCount: Object.keys(result.pageJson).length, warnings: [...new Set(result.warnings)] },
      201,
    );
  } catch (error) {
    return handleError(error);
  }
}
