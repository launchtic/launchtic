// Single source of truth for an AI tool — co-locates schema + execute +
// confirm metadata so each tool is one self-contained block.
//
// Why not Vercel SDK's `tool()` directly? We need a `requiresConfirm` flag +
// optional `summary` that aren't part of the SDK shape. Our domain registry
// maps these to the SDK shape at runtime in `index.ts`.

import type { z } from "zod";

export type ToolContext = {
  workspaceId: string;
  userId: string;
};

export type ToolDef<S extends z.ZodObject<any> = z.ZodObject<any>> = {
  name: string;
  description: string;
  inputSchema: S;
  // true → write tool. SDK omits `execute`, returns the call as a pending
  // toolCall to the UI for user confirmation. We then run `execute` manually.
  // false → read tool. SDK auto-executes inside the loop.
  requiresConfirm: boolean;
  // Async-friendly preview shown in the ConfirmCard for write tools.
  // Receives ctx so it can resolve names via DB lookup.
  summary?: (args: z.infer<S>, ctx: ToolContext) => string | Promise<string>;
  // Always defined — even read tools have execute. SDK calls it for reads;
  // we call it manually after confirm for writes.
  execute: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
};

// Identity helper — exists purely for type inference. Lets each tool definition
// keep its zod schema's inferred type instead of degrading to `any`.
export function defineTool<S extends z.ZodObject<any>>(def: ToolDef<S>): ToolDef<S> {
  return def;
}
