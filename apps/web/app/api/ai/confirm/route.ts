import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { runChat, executeConfirmedTool } from "../../../../lib/ai/llm";
import { getAiSettings } from "../../../../lib/ai/settings";
import { getOrCreateConversation } from "../../../../lib/ai/conversation";

const schema = z.object({
  messageId: z.string(),
  approve:   z.boolean(),
  timezone:  z.string().optional(),
});

// Streams like /api/ai/chat — same event format. The confirmed write tool
// runs first (synchronously, no events since it's not part of the SDK loop),
// then runChat resumes and may auto-execute follow-up read tools whose
// progress is streamed.

export async function POST(req: NextRequest) {
  const r = await requireAccess("settings:ai:read");
  if (!r.ok) return r.response;
  const { workspaceId, userId } = r;

  const ai = await getAiSettings(workspaceId);
  if (!ai || !ai.enabled) return err("AI assistant disabled", 400);
  if (!ai.apiKey) return err("API key missing — re-enter it in Settings.", 500);
  const apiKey = ai.apiKey;

  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } });
  if (!ws) return err("Workspace not found", 404);
  const workspaceSlug = ws.slug;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return err(e instanceof Error ? e.message : "Invalid request", 400);
  }
  const { messageId, approve, timezone } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        const conv = await getOrCreateConversation(workspaceId, userId);

        // The confirmed write tool itself isn't routed through SDK execute,
        // so wrap manually to emit a single start/done pair for visibility.
        const meta = approve
          ? await db.aiMessage
              .findUnique({ where: { id: messageId }, select: { toolName: true } })
              .then((m) => m?.toolName ?? null)
              .catch(() => null)
          : null;

        if (approve && meta) {
          send({ type: "tool_start", name: meta });
        }
        const confirmStart = Date.now();
        try {
          await executeConfirmedTool({
            conversationId: conv.id,
            messageId,
            approve,
            ctx: { workspaceId, workspaceSlug, userId },
          });
          if (approve && meta) {
            send({ type: "tool_done", name: meta, ms: Date.now() - confirmStart });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Tool failed";
          if (approve && meta) {
            send({ type: "tool_error", name: meta, ms: Date.now() - confirmStart, error: msg });
          }
          throw e;
        }

        // Continue the chat loop so the LLM can respond to the tool_result.
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
        const msg = e instanceof Error ? e.message : "Confirm failed";
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
      "X-Accel-Buffering": "no",
    },
  });
}
