import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
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

    // Workspace slug for tool-generated links (see chat/route.ts).
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } });
    if (!ws) return err("Workspace not found", 404);
    const workspaceSlug = ws.slug;

    const { messageId, approve, timezone } = schema.parse(await req.json());

    const conv = await getOrCreateConversation(workspaceId, userId);

    await executeConfirmedTool({
      conversationId: conv.id,
      messageId,
      approve,
      ctx: { workspaceId, workspaceSlug, userId },
    });

    // Continue the chat loop so the LLM can respond to the tool_result.
    const result = await runChat({
      settings: ai,
      apiKey,
      conversationId: conv.id,
      ctx: { workspaceId, workspaceSlug, userId },
      timezone,
    });

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
