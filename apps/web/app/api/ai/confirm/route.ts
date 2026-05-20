import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { runChat, executeConfirmedTool } from "../../../../lib/ai/llm";
import { getAiSettings } from "../../../../lib/ai/settings";
import { getOrCreateConversation } from "../../../../lib/ai/conversation";

const schema = z.object({
  messageId: z.string(),
  approve:   z.boolean(),
  timezone:  z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("settings:write");
    if (!r.ok) return r.response;
    const { workspaceId, userId } = r;

    const ai = await getAiSettings(workspaceId);
    if (!ai || !ai.enabled) return err("AI assistant disabled", 400);
    if (!ai.apiKey) return err("API key missing — re-enter it in Settings.", 500);
    const apiKey = ai.apiKey;

    const { messageId, approve, timezone } = schema.parse(await req.json());

    const conv = await getOrCreateConversation(workspaceId, userId);

    await executeConfirmedTool({
      conversationId: conv.id,
      messageId,
      approve,
      ctx: { workspaceId, userId },
    });

    // Continue the chat loop so the LLM can respond to the tool_result.
    const result = await runChat({
      settings: ai,
      apiKey,
      conversationId: conv.id,
      ctx: { workspaceId, userId },
      timezone,
    });

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
