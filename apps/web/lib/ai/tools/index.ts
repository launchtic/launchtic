// AI tools registry — collects all domain tools and exposes the API used
// by lib/ai/llm.ts.
//
// To add a new tool: define it in the appropriate domain file (or create a
// new domain file), then add it to its domain's exported array. This file
// auto-derives both the SDK shape and the meta lookup.

import { tool, type Tool } from "ai";
import type { ToolContext, ToolDef } from "./define";
import { checkToolPermission } from "./define";

import { orderTools }         from "./order";
import { contactTools }       from "./contact";
import { funnelTools }        from "./funnel";
import { pageTemplateTools }  from "./page-template";
import { broadcastTools }     from "./broadcast";
import { sequenceTools }      from "./sequence";
import { automationTools }    from "./automation";
import { couponTools }        from "./coupon";
import { productTools }       from "./product";
import { subscriptionTools }  from "./subscription";
import { transactionTools }   from "./transaction";
import { emailTemplateTools } from "./email-template";
import { emailLogTools }      from "./email-log";

// Re-export ToolContext for callers (llm.ts, conversation.ts, etc.) that
// import it via the tools barrel.
export type { ToolContext, ToolDef } from "./define";
export { toolLabel } from "./labels";

// All tools in one array. Order doesn't affect behavior — only used as a
// stable iteration order for buildSdkTools.
//
// Typed as `ToolDef<any>[]` because each tool has its own concrete zod schema
// type. Generic variance prevents `ToolDef<ZodObject<{x}>>` from assigning to
// `ToolDef<ZodObject<any>>` due to function arg contravariance — `any` here
// is the standard escape hatch. Each tool's internal types stay strict.
const ALL_TOOLS: ToolDef<any>[] = [
  ...orderTools,
  ...contactTools,
  ...funnelTools,
  ...pageTemplateTools,
  ...broadcastTools,
  ...sequenceTools,
  ...automationTools,
  ...couponTools,
  ...productTools,
  ...subscriptionTools,
  ...transactionTools,
  ...emailTemplateTools,
  ...emailLogTools,
];

// Lifecycle events fired by the wrapped execute — surfaced to the chat UI
// via SSE so the operator sees real-time progress chips instead of a static
// "Thinking..." spinner. tool_start fires before execute, tool_done after.
export type ToolEvent =
  | { type: "tool_start"; name: string }
  | { type: "tool_done";  name: string; ms: number }
  | { type: "tool_error"; name: string; ms: number; error: string };

// Build the merged tools object passed to Vercel SDK's generateText.
// Read tools (requiresConfirm=false) → execute included → SDK auto-runs.
// Write tools (requiresConfirm=true) → execute omitted → SDK returns the call
// to caller via result.toolCalls so we can route through our confirm flow.
//
// Branch the tool() call: SDK's overloads disallow conditional execute via
// spread (the "no execute" overload requires execute to be `undefined`,
// not absent). Explicit branches let TS pick the right overload per case.
//
// onEvent (optional) wraps every read-tool execute with start/done/error
// notifications. Write tools never fire events from here — they're surfaced
// to the UI as pending confirm cards instead.
export function buildSdkTools(
  ctx: ToolContext,
  onEvent?: (event: ToolEvent) => void,
): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const t of ALL_TOOLS) {
    if (t.requiresConfirm) {
      // Write tools omit `execute` — SDK returns the call to caller for the
      // confirm flow. Permission is re-checked in llm.executeConfirmedTool
      // before actually running it.
      out[t.name] = tool({
        description: t.description,
        inputSchema: t.inputSchema as any,
      });
    } else {
      // Read tools auto-execute inside the SDK loop. Gate up-front: if user
      // lacks `requiredPermission` (and isn't Org owner), return the structured
      // denial as the tool result so the LLM can explain to the user.
      out[t.name] = tool({
        description: t.description,
        inputSchema: t.inputSchema as any,
        execute: async (args: any) => {
          const denial = checkToolPermission(t, ctx);
          if (denial) {
            onEvent?.({
              type:  "tool_error",
              name:  t.name,
              ms:    0,
              error: `permission_denied: ${denial.permission}`,
            });
            return denial;
          }
          if (!onEvent) return t.execute(args, ctx);
          const start = Date.now();
          onEvent({ type: "tool_start", name: t.name });
          try {
            const result = await t.execute(args, ctx);
            onEvent({ type: "tool_done", name: t.name, ms: Date.now() - start });
            return result;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            onEvent({ type: "tool_error", name: t.name, ms: Date.now() - start, error: msg });
            throw e;
          }
        },
      });
    }
  }
  return out;
}

// Used by llm.ts to look up a tool by name during the confirm flow:
// runs `tool.execute(args, ctx)` for approved write tools, and `tool.summary`
// for the ConfirmCard preview text.
export function getToolMeta(name: string): ToolDef<any> | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

// Convenience for tests / debugging.
export function listAllToolNames(): string[] {
  return ALL_TOOLS.map((t) => t.name);
}
