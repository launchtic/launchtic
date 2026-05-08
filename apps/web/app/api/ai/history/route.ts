import { ok, err, handleError, getWorkspaceId, getUserId } from "../../../../lib/api";
import { getOrCreateConversation, loadMessages } from "../../../../lib/ai/conversation";

export async function GET() {
  try {
    const workspaceId = await getWorkspaceId();
    const userId = await getUserId();
    if (!workspaceId || !userId) return err("Unauthorized", 401);

    const conv = await getOrCreateConversation(workspaceId, userId);
    const messages = await loadMessages(conv.id);

    return ok({
      conversationId: conv.id,
      messages: messages.map((m: typeof messages[number]) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolName: m.toolName,
        toolStatus: m.toolStatus,
        toolCallId: m.toolCallId,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
