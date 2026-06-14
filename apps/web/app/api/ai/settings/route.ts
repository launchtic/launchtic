import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { demoGuard } from "../../../../lib/demo";
import { getPublicAiSettings, saveAiSettings, deleteAiSettings } from "../../../../lib/ai/settings";

const updateSchema = z.object({
  provider: z.enum(["anthropic", "google", "deepseek", "openai"]),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  enabled: z.boolean(),
});

export async function GET() {
  try {
    const r = await requireAccess("settings:ai:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const settings = await getPublicAiSettings(workspaceId);
    return ok(settings);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("settings:ai:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const data = updateSchema.parse(await req.json());
    const updated = await saveAiSettings(workspaceId, data);
    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE() {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("settings:ai:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    await deleteAiSettings(workspaceId);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
