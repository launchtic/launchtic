import { ok, err, handleError, getWorkspaceId, getUserId } from "../../../../lib/api";
import { clearConversation } from "../../../../lib/ai/conversation";

export async function POST() {
  try {
    const workspaceId = await getWorkspaceId();
    const userId = await getUserId();
    if (!workspaceId || !userId) return err("Unauthorized", 401);

    await clearConversation(workspaceId, userId);
    return ok({ cleared: true });
  } catch (error) {
    return handleError(error);
  }
}
