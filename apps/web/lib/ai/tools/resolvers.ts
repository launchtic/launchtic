// Label resolvers used by tool `summary` functions to render
// human-readable previews instead of raw cuid IDs in the ConfirmCard.
//
// All best-effort: return the raw ID if entity was deleted between LLM
// proposing the call and the user clicking Confirm.

import { db } from "@launchtic/database";
import type { ToolContext } from "./define";

export async function resolveContactLabel(id: string, ctx: ToolContext): Promise<string> {
  const c = await db.contact.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { email: true, firstName: true, lastName: true },
  }).catch(() => null);
  if (!c) return id;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name ? `${name} <${c.email}>` : c.email;
}

export async function resolveTagLabel(id: string, ctx: ToolContext): Promise<string> {
  const t = await db.tag.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { name: true },
  }).catch(() => null);
  return t?.name ?? id;
}

export async function resolveWorkflowLabel(id: string, ctx: ToolContext): Promise<string> {
  const w = await db.workflow.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { name: true },
  }).catch(() => null);
  return w?.name ?? id;
}
