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

export async function resolveSequenceLabel(id: string, ctx: ToolContext): Promise<string> {
  const s = await db.emailSequence.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { name: true },
  }).catch(() => null);
  return s?.name ?? id;
}

export async function resolveAutomationLabel(id: string, ctx: ToolContext): Promise<string> {
  const a = await db.automation.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { name: true },
  }).catch(() => null);
  return a?.name ?? id;
}
