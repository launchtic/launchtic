import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, handleError, getWorkspaceId, getUserId } from "../../../../lib/api";
import { getAiSettings } from "../../../../lib/ai/settings";
import { decrypt } from "../../../../lib/crypto";
import { getOrCreateConversation, appendMessage } from "../../../../lib/ai/conversation";
import { runChat } from "../../../../lib/ai/llm";

const sendSchema = z.object({
  message: z.string().min(1).max(4000),
  timezone: z.string().optional().describe("IANA timezone from browser, e.g. 'Asia/Ho_Chi_Minh'."),
});

export async function POST(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    const userId = await getUserId();
    if (!workspaceId || !userId) return err("Unauthorized", 401);

    const ai = await getAiSettings(workspaceId);
    if (!ai || !ai.enabled) {
      return err("AI assistant is not configured. Add an API key in Settings → AI Assistant.", 400);
    }

    let apiKey: string;
    try { apiKey = decrypt(ai.apiKeyEnc); }
    catch { return err("Stored API key is corrupted. Re-enter it in Settings.", 500); }

    const { message, timezone } = sendSchema.parse(await req.json());

    const conv = await getOrCreateConversation(workspaceId, userId);
    await appendMessage(conv.id, { role: "user", content: message });

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
