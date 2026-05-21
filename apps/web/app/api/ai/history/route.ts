import { ok, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getOrCreateConversation, loadMessages } from "../../../../lib/ai/conversation";

export async function GET() {
  try {
    // Loading your own chat history requires the same gate as chatting.
    const r = await requireAccess("ai:use");
    if (!r.ok) return r.response;
    const { workspaceId, userId } = r;

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
