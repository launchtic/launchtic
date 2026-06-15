import { NextRequest } from "next/server";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { demoGuard } from "../../../../lib/demo";
import { importBundle } from "../../../../lib/template-import";

export const dynamic = "force-dynamic";

// POST /api/templates/import — import ONE .ltbundle (multipart: file=<bundle>).
// Owner-only. The bundle is self-describing (page | email | funnel) and routed
// to the right entity. Multi-file import = the client loops, calling this once
// per file so each gets its own result + partial success.
export async function POST(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;

    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return err("No file provided", 400);

    const buf = Buffer.from(await file.arrayBuffer());
    try {
      const result = await importBundle(r.workspaceId, buf);
      return ok(result);
    } catch (e: any) {
      // Malformed / corrupt bundle or unsupported kind — surface the reason.
      return err(e?.message ?? "Invalid bundle", 400);
    }
  } catch (error) {
    return handleError(error);
  }
}
