// Audit log of AI tool executions for the current user.
//
// Reads from AiMessage where role = "tool_use" — we already track every tool
// call with toolName + args + status (executed/rejected/error). No new schema
// needed.
//
// Returns latest 100 by default. Operator can review what AI has done on
// their behalf — important for trust + compliance.

import { ok, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { db } from "@launchtic/database";

export async function GET() {
  try {
    const r = await requireAccess("settings:ai:read");
    if (!r.ok) return r.response;
    const { workspaceId, userId } = r;

    // Find the user's conversation (1 per user/workspace currently)
    const conv = await db.aiConversation.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    if (!conv) return ok({ count: 0, actions: [] });

    const toolCalls = await db.aiMessage.findMany({
      where: { conversationId: conv.id, role: "tool_use" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        toolName: true,
        toolStatus: true,
        toolCallId: true,
        content: true,
        createdAt: true,
      },
    });

    // Match each tool_use with its tool_result for full audit context
    const callIds = toolCalls.map((c) => c.toolCallId).filter(Boolean) as string[];
    const results = callIds.length > 0
      ? await db.aiMessage.findMany({
          where: { conversationId: conv.id, role: "tool_result", toolCallId: { in: callIds } },
          select: { toolCallId: true, content: true, toolStatus: true },
        })
      : [];
    const resultByCallId = new Map(results.map((r) => [r.toolCallId!, r]));

    return ok({
      count: toolCalls.length,
      actions: toolCalls.map((c) => {
        const result = resultByCallId.get(c.toolCallId ?? "");
        return {
          id: c.id,
          toolName: c.toolName,
          status: c.toolStatus,
          args: c.content,
          result: result?.content ?? null,
          createdAt: c.createdAt.toISOString(),
        };
      }),
    });
  } catch (error) {
    return handleError(error);
  }
}
