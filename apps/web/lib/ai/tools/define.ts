// Single source of truth for an AI tool — co-locates schema + execute +
// confirm metadata so each tool is one self-contained block.
//
// Why not Vercel SDK's `tool()` directly? We need a `requiresConfirm` flag,
// optional `summary`, and `requiredPermission` (workspace perm gate) that
// aren't part of the SDK shape. Our domain registry maps these to the SDK
// shape at runtime in `index.ts`.

import type { z } from "zod";

export type ToolContext = {
  workspaceId:   string;
  workspaceSlug: string;  // URL prefix — needed to build dashboard links in tool results
  userId:        string;
  // Effective permission list for this user in this workspace. The chat
  // route resolves these via requireAccess() and passes through. Org owner
  // arrives here with the full permission set (already expanded server-side).
  permissions:   readonly string[];
  // True when the caller is the Organization owner. Owner bypasses every
  // tool's requiredPermission check — they always have full access.
  isOwner:       boolean;
};

export type ToolDef<S extends z.ZodObject<any> = z.ZodObject<any>> = {
  name: string;
  description: string;
  inputSchema: S;
  // true → write tool. SDK omits `execute`, returns the call as a pending
  // toolCall to the UI for user confirmation. We then run `execute` manually.
  // false → read tool. SDK auto-executes inside the loop.
  requiresConfirm: boolean;
  // Workspace permission gate. If set, the runtime checks
  // ctx.permissions.includes(requiredPermission) before executing — failures
  // return a structured "permission_denied" result so the LLM can explain
  // to the user. Owner (ctx.isOwner) bypasses unconditionally.
  //
  // Omit ONLY for tools that should be available to every workspace member
  // (e.g. generic help/info tools). Most tools should set this.
  requiredPermission?: string;
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

/**
 * Check whether a ctx can run a tool. Returns null if allowed, or a
 * structured denial result to return as the tool's output so the LLM can
 * see the failure and explain it to the user.
 *
 * The "permission_denied" shape is intentionally stable + JSON-typed so
 * different LLM providers handle it consistently in their tool_result
 * blocks. Surfacing the missing permission name lets the assistant tell
 * the user "you need 'orders:refund' for that" instead of guessing.
 */
export type PermissionDenial = {
  error:        "permission_denied";
  permission:   string;
  message:      string;
};

export function checkToolPermission(
  tool: ToolDef<any>,
  ctx:  ToolContext,
): PermissionDenial | null {
  if (!tool.requiredPermission) return null;
  if (ctx.isOwner) return null;
  if (ctx.permissions.includes(tool.requiredPermission)) return null;
  return {
    error:      "permission_denied",
    permission: tool.requiredPermission,
    message:    `The current user does not have the "${tool.requiredPermission}" permission required to run "${tool.name}". Tell the user they can't perform this action and suggest they ask their workspace admin to grant the permission.`,
  };
}
