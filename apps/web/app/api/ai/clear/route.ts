import { ok, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { clearConversation } from "../../../../lib/ai/conversation";

export async function POST() {
  try {
    // Clearing your own chat history requires the same gate as chatting.
    const r = await requireAccess("ai:use");
    if (!r.ok) return r.response;
    const { workspaceId, userId } = r;

    await clearConversation(workspaceId, userId);
    return ok({ cleared: true });
  } catch (error) {
    return handleError(error);
  }
}
