import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getAiSettings } from "../../../../lib/ai/settings";
import { getOrCreateConversation, appendMessage } from "../../../../lib/ai/conversation";
import { runChat } from "../../../../lib/ai/llm";

const sendSchema = z.object({
  message: z.string().min(1).max(4000),
  timezone: z.string().optional().describe("IANA timezone from browser, e.g. 'Asia/Ho_Chi_Minh'."),
});

// SSE event format (single \n\n-delimited line per event):
//   data: {"type":"tool_start","name":"list_funnels"}
//   data: {"type":"tool_done","name":"list_funnels","ms":420}
//   data: {"type":"complete","kind":"text","messages":[...]}
//   data: {"type":"error","error":"..."}
//
// We pick "data: only" (no event: lines) so the client parses one JSON
// payload per chunk — keeps parsing trivial vs EventSource semantics.

export async function POST(req: NextRequest) {
  // Authorize + load context BEFORE opening the stream — failures here can
  // still return a normal JSON error response.
  const r = await requireAccess("settings:ai:read");
  if (!r.ok) return r.response;
  const { workspaceId, userId } = r;

  const ai = await getAiSettings(workspaceId);
  if (!ai || !ai.enabled) {
    return err("AI assistant is not configured. Add an API key in Settings → AI Assistant.", 400);
  }
  if (!ai.apiKey) return err("API key missing — re-enter it in Settings.", 500);
  const apiKey = ai.apiKey;

  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } });
  if (!ws) return err("Workspace not found", 404);
  const workspaceSlug = ws.slug;

  let body: z.infer<typeof sendSchema>;
  try {
    body = sendSchema.parse(await req.json());
  } catch (e) {
    return err(e instanceof Error ? e.message : "Invalid request", 400);
  }
  const { message, timezone } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        const conv = await getOrCreateConversation(workspaceId, userId);
        await appendMessage(conv.id, { role: "user", content: message });

        const result = await runChat({
          settings: ai,
          apiKey,
          conversationId: conv.id,
          ctx: { workspaceId, workspaceSlug, userId },
          timezone,
          onEvent: send,
        });

        send({ type: "complete", ...result });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Chat failed";
        send({ type: "error", error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      // Hint to proxies / Vercel that this is a streaming response.
      "X-Accel-Buffering": "no",
    },
  });
}
