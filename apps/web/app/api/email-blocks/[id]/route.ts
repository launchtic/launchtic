import { db } from "@launchtic/database";
import { ok, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

// DELETE /api/email-blocks/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("email_templates:write");
    if (!r.ok) return r.response;
    const { id } = await params;
    await db.savedBlock.deleteMany({ where: { id, workspaceId: r.workspaceId, kind: "email" } });
    return ok({ id });
  } catch (error) {
    return handleError(error);
  }
}
