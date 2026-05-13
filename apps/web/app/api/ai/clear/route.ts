import { ok, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { clearConversation } from "../../../../lib/ai/conversation";

export async function POST() {
  try {
    const r = await requireAccess("settings:write");
    if (!r.ok) return r.response;
    const { workspaceId, userId } = r;

    await clearConversation(workspaceId, userId);
    return ok({ cleared: true });
  } catch (error) {
    return handleError(error);
  }
}
