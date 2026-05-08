// AI tools registry — collects all domain tools and exposes the API used
// by lib/ai/llm.ts.
//
// To add a new tool: define it in the appropriate domain file (or create a
// new domain file), then add it to its domain's exported array. This file
// auto-derives both the SDK shape and the meta lookup.

import { tool, type Tool } from "ai";
import type { ToolContext, ToolDef } from "./define";

import { orderTools }       from "./order";
import { contactTools }     from "./contact";
import { funnelTools }      from "./funnel";
import { pageTemplateTools } from "./page-template";
import { broadcastTools }   from "./broadcast";
import { sequenceTools }    from "./sequence";
import { automationTools }  from "./automation";

// Re-export ToolContext for callers (llm.ts, conversation.ts, etc.) that
// import it via the tools barrel.
export type { ToolContext, ToolDef } from "./define";

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
];

// Build the merged tools object passed to Vercel SDK's generateText.
// Read tools (requiresConfirm=false) → execute included → SDK auto-runs.
// Write tools (requiresConfirm=true) → execute omitted → SDK returns the call
// to caller via result.toolCalls so we can route through our confirm flow.
//
// Branch the tool() call: SDK's overloads disallow conditional execute via
// spread (the "no execute" overload requires execute to be `undefined`,
// not absent). Explicit branches let TS pick the right overload per case.
export function buildSdkTools(ctx: ToolContext): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const t of ALL_TOOLS) {
    if (t.requiresConfirm) {
      out[t.name] = tool({
        description: t.description,
        inputSchema: t.inputSchema as any,
      });
    } else {
      out[t.name] = tool({
        description: t.description,
        inputSchema: t.inputSchema as any,
        execute: async (args: any) => t.execute(args, ctx),
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
