import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getAiSettings } from "../../../../lib/ai/settings";
import { getOrCreateConversation, appendMessage } from "../../../../lib/ai/conversation";
import { runChat } from "../../../../lib/ai/llm";

const sendSchema = z.object({
  message: z.string().min(1).max(4000),
  timezone: z.string().optional().describe("IANA timezone from browser, e.g. 'Asia/Ho_Chi_Minh'."),
});

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("settings:write");
    if (!r.ok) return r.response;
    const { workspaceId, userId } = r;

    const ai = await getAiSettings(workspaceId);
    if (!ai || !ai.enabled) {
      return err("AI assistant is not configured. Add an API key in Settings → AI Assistant.", 400);
    }
    if (!ai.apiKey) return err("API key missing — re-enter it in Settings.", 500);
    const apiKey = ai.apiKey;

    // Workspace slug — needed by tools to build correct dashboard links.
    // One cheap lookup per chat turn (AI chat isn't a hot path).
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } });
    if (!ws) return err("Workspace not found", 404);
    const workspaceSlug = ws.slug;

    const { message, timezone } = sendSchema.parse(await req.json());

    const conv = await getOrCreateConversation(workspaceId, userId);
    await appendMessage(conv.id, { role: "user", content: message });

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
