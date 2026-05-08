// Conversation persistence — one conversation per (workspace, user). Cleared
// explicitly via /api/ai/clear. Messages are append-only with their tool
// lifecycle status tracked on the row.

import { db } from "@launchtic/database";

export async function getOrCreateConversation(workspaceId: string, userId: string) {
  const existing = await db.aiConversation.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (existing) return existing;
  return db.aiConversation.create({
    data: { workspaceId, userId },
  });
}

export async function loadMessages(conversationId: string, limit = 100) {
  return db.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function appendMessage(
  conversationId: string,
  data: {
    role: "user" | "assistant" | "tool_use" | "tool_result";
    content: unknown;
    toolCallId?: string;
    toolName?: string;
    toolStatus?: "pending_confirm" | "approved" | "rejected" | "executed" | "error";
  },
) {
  const message = await db.aiMessage.create({
    data: {
      conversationId,
      role: data.role,
      content: data.content as any,
      toolCallId: data.toolCallId ?? null,
      toolName: data.toolName ?? null,
      toolStatus: data.toolStatus ?? null,
    },
  });
  // Touch conversation.updatedAt for sort/recency.
  await db.aiConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
  return message;
}

export async function updateMessageStatus(
  messageId: string,
  toolStatus: "approved" | "rejected" | "executed" | "error",
) {
  return db.aiMessage.update({
    where: { id: messageId },
    data: { toolStatus },
  });
}

// Hard-delete a message row. Used by dedup logic to drop superseded tool_use
// entries that would otherwise leave the conversation with orphan tool_use
// blocks (LLM API rejects unmatched tool_calls).
export async function deleteMessage(messageId: string): Promise<void> {
  await db.aiMessage.delete({ where: { id: messageId } });
}

export async function clearConversation(workspaceId: string, userId: string) {
  const conv = await db.aiConversation.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!conv) return;
  await db.aiMessage.deleteMany({ where: { conversationId: conv.id } });
}
