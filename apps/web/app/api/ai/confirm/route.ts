import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, handleError, getWorkspaceId, getUserId } from "../../../../lib/api";
import { runChat, executeConfirmedTool } from "../../../../lib/ai/llm";
import { getAiSettings } from "../../../../lib/ai/settings";
import { decrypt } from "../../../../lib/crypto";
import { getOrCreateConversation } from "../../../../lib/ai/conversation";

const schema = z.object({
  messageId: z.string(),
  approve:   z.boolean(),
  timezone:  z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    const userId = await getUserId();
    if (!workspaceId || !userId) return err("Unauthorized", 401);

    const ai = await getAiSettings(workspaceId);
    if (!ai || !ai.enabled) return err("AI assistant disabled", 400);

    let apiKey: string;
    try { apiKey = decrypt(ai.apiKeyEnc); }
    catch { return err("Stored API key is corrupted", 500); }

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
