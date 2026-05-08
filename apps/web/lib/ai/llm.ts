// Provider-agnostic LLM orchestration via Vercel AI SDK.
//
// Flow:
//   1. Build messages from DB conversation history.
//   2. Call generateText with maxSteps=8.
//      - Read tools have `execute` → SDK auto-runs in the loop.
//      - Write tools omit `execute` → SDK stops, returns them in result.toolCalls
//        as "client-side" tool calls awaiting confirm.
//   3. Persist all steps (text + tool calls + tool results) to DB.
//   4. If pending tool calls exist → return them to UI for user confirmation.
//   5. On confirm → manually execute (lib/ai/tools.ts handler) → append
//      tool_result + run another generateText turn so the LLM can respond.
//
// Why Vercel SDK + not direct Anthropic SDK:
//   - Multi-provider: anthropic ↔ google ↔ deepseek with one line change
//   - Auto-merges streamed text + tool_use blocks
//   - Standardized tool call shape across providers (Anthropic uses
//     content blocks, Google uses functionCall parts — Vercel hides this)
//   - Less code on our side, less to maintain

import { generateText, stepCountIs, type ModelMessage, type ToolCallPart, type ToolResultPart } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createDeepSeek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";

// Vercel AI SDK v5 vs v4 compat helpers — v5 renamed call.args → call.input
// and toolResult.result → toolResult.output (typed envelope). Read both
// shapes so a future SDK upgrade doesn't silently break tool persistence.
function readCallArgs(call: any): Record<string, unknown> {
  return (call?.input ?? call?.args ?? {}) as Record<string, unknown>;
}
function readToolResult(result: any): { value: unknown; isError: boolean } {
  if (!result) return { value: undefined, isError: false };
  // v5 envelope: output: { type: 'json'|'text'|'error-text'|'error-json', value }
  const out = result.output;
  if (out && typeof out === "object" && "type" in out) {
    const isError = String(out.type).startsWith("error");
    return { value: out.value, isError };
  }
  // v5 raw output (some shapes), or v4 .result
  const v = out !== undefined ? out : result.result;
  return { value: v, isError: result.isError === true };
}
import type { AiSettings } from "./settings";
import { buildSdkTools, getToolMeta, type ToolContext } from "./tools";
import { appendMessage, loadMessages, updateMessageStatus, deleteMessage } from "./conversation";

const MAX_STEPS = 8;

// Build the system prompt fresh per request so {today} is correct. Without
// this, LLMs without a built-in clock (most of them) guess the date from
// training data and silently query stale ranges (e.g. "this year" → 2024).
function buildSystemPrompt(timezone?: string): string {
  const now = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const nowIso = now.toISOString();              // full UTC timestamp
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sevenDaysAgo  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Compute "tomorrow at 9 AM in user's timezone, expressed as UTC ISO 8601".
  // LLMs default to UTC when given "9 AM tomorrow" → the resulting datetime
  // lands at the wrong wall-clock time for the operator. Including a worked
  // example forces the LLM to convert through the operator's zone.
  const tz = timezone || "UTC";
  let tzExample = "";
  try {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(tomorrow);  // "YYYY-MM-DD" in the operator's zone
    // Find the UTC instant when "ymd 09:00" happens in user's zone:
    // start with naive UTC, then check what wall-clock that produces in tz,
    // then offset accordingly.
    const naiveUtc = new Date(`${ymd}T09:00:00Z`);
    const partsInTz = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", hour12: false,
    }).format(naiveUtc);
    const tzHour = parseInt(partsInTz, 10);
    const offsetHours = 9 - tzHour;
    const real = new Date(naiveUtc.getTime() + offsetHours * 60 * 60 * 1000);
    tzExample = `\n  Example: "9 AM tomorrow" in ${tz} → scheduledAt="${real.toISOString()}"`;
  } catch {
    // Bad timezone string — skip example, LLM still gets bare timezone hint.
  }

  return `You are the Launchtic Assistant — an embedded AI helper inside Launchtic, a marketing automation tool.

Your job: help the operator (the logged-in user) manage their workspace. They run a business with funnels, contacts, email broadcasts, sequences, and automations.

CAPABILITIES — you have tools to:
- Query data: orders, contacts, broadcasts, sequences, automations, tags, revenue
- Make changes: create tags, tag/untag contacts, pause/activate sequences and automations

DATE CONTEXT (use these for date-range tools, do NOT guess):
- Now (UTC): ${nowIso}
- Today is ${today}
- Operator timezone: ${tz}
- "This week" / "last 7 days" → from=${sevenDaysAgo} to=${today}
- "Last 30 days" / "this month" → from=${thirtyDaysAgo} to=${today}
- "Year to date" → from=${today.slice(0, 4)}-01-01 to=${today}
- If the user doesn't specify a range, default to last 30 days.
- For relative times like "in 10 minutes" → compute from "Now (UTC)" above + add 2-3 min buffer to account for tool-call latency + 10-min minimum lead time on broadcast scheduling.

DATETIME for \`scheduledAt\`: UTC ISO 8601 ("YYYY-MM-DDTHH:MM:SSZ"). Convert from operator's timezone above.${tzExample}
- Do NOT show your timezone conversion math, UTC values, or "check >10 min" verification in your chat reply. The conversion is internal — user only sees the final action via the ConfirmCard.

GUIDELINES:
- When the user asks a question, use the read tools to fetch real data, then answer concisely. Don't make up numbers.
- When the user asks you to do something (create, change, pause, etc.), call the matching write tool. The user will confirm before it executes.
- Never invent IDs or dates. Use list_* tools first to find IDs. Use the DATE CONTEXT above for dates.
- If a tool fails, explain the error in plain language. Offer the next step.
- Be concise. Operators are busy. Lead with the answer, then details if needed.
- Use markdown sparingly: bullet lists for multi-item results, bold for key numbers.
- Never expose internal IDs unless explicitly asked. Use names/emails when referring to entities.
- Respond in the same language the user writes in.
- If the user asks about something you can't do (e.g. send email immediately, generate landing page, refund order), say so plainly and suggest the closest alternative or the manual UI path.
- After completing a task, DO NOT proactively offer follow-up help that requires capabilities you don't have. Specifically, you CANNOT edit page content, change colors / layouts / fonts, add or remove individual elements (buttons / images / sections), or fine-tune copy on existing pages — those require the operator to open the editor manually. Don't end messages with offers like "Want me to change colors?" or "Should I add a download button?" — that's misleading. Either suggest swap_step_template (for a different template) or point them at the editor link.

FUNNEL TEMPLATES — Before \`create_funnel_from_spec\` or \`add_funnel_step\`, call \`list_page_templates\` (optionally filtered by step type) to see available designs. Match template descriptions to the product context (info-product, SaaS, high-ticket, etc.) and pass the chosen IDs via \`templateIds\` (create) or \`templateId\` (add). Skip the template lookup only if the operator has no specific style preference and the defaults are fine.

LINKS — Always use markdown link format \`[label](/path)\` when pointing the user to a page.
- Tool results often include a path or URL field (editorUrl, dashboardUrl, etc.) — wrap them like: \`[Open editor](/funnels/abc123)\`, \`[View broadcast](/broadcasts/abc)\`.
- Never paste a raw path like "/funnels/cmop15..." — it won't be clickable.
- If a tool result has a \`message\` field that already contains markdown links, pass it through unchanged.`;
}

// Provider factory — swap providers by changing one line in settings.
export function getModel(settings: AiSettings, apiKey: string): LanguageModel {
  switch (settings.provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(settings.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(settings.model);
    case "deepseek":
      return createDeepSeek({ apiKey })(settings.model);
    default:
      throw new Error(`Unknown provider: ${(settings as any).provider}`);
  }
}

// ─── DB ↔ Vercel SDK message conversion ──────────────────────────────────────
// Vercel SDK ModelMessage shape (v5):
//   { role: "user" | "assistant" | "tool", content: string | Part[] }
// where Part = { type: "text"|"tool-call"|"tool-result", ... }
//   - tool-call:   { type, toolCallId, toolName, input }    (v5: input, v4: args)
//   - tool-result: { type, toolCallId, toolName, output: { type: "json"|"error-json", value } }

function dbMessagesToSdk(messages: Awaited<ReturnType<typeof loadMessages>>): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content as string });
    } else if (m.role === "assistant") {
      out.push({ role: "assistant", content: m.content as string });
    } else if (m.role === "tool_use") {
      const part = {
        type: "tool-call" as const,
        toolCallId: m.toolCallId!,
        toolName: m.toolName!,
        input: m.content as Record<string, unknown>,
      } as ToolCallPart;
      const prev = out[out.length - 1];
      if (prev && prev.role === "assistant" && Array.isArray(prev.content)) {
        (prev.content as ToolCallPart[]).push(part);
      } else {
        out.push({ role: "assistant", content: [part] });
      }
    } else if (m.role === "tool_result") {
      const isError = m.toolStatus === "error";
      const part = {
        type: "tool-result" as const,
        toolCallId: m.toolCallId!,
        toolName: m.toolName!,
        output: isError
          ? { type: "error-json" as const, value: m.content as any }
          : { type: "json" as const, value: m.content as any },
      } as ToolResultPart;
      const prev = out[out.length - 1];
      if (prev && prev.role === "tool" && Array.isArray(prev.content)) {
        (prev.content as ToolResultPart[]).push(part);
      } else {
        out.push({ role: "tool", content: [part] });
      }
    }
  }
  return out;
}

// ─── Public types ────────────────────────────────────────────────────────────

export type PublicMessage = {
  id: string;
  role: string;
  content: unknown;
  toolName?: string | null;
  toolStatus?: string | null;
  toolCallId?: string | null;
  createdAt: string;
};

export type PendingToolCall = {
  messageId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
};

export type ChatTurnResult =
  | { kind: "text"; messages: PublicMessage[] }
  | { kind: "pending_confirm"; messages: PublicMessage[]; pending: PendingToolCall[] };

function toPublicMessage(m: Awaited<ReturnType<typeof loadMessages>>[number]): PublicMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    toolName: m.toolName,
    toolStatus: m.toolStatus,
    toolCallId: m.toolCallId,
    createdAt: m.createdAt.toISOString(),
  };
}

// ─── Run a chat turn ─────────────────────────────────────────────────────────

export async function runChat(opts: {
  settings: AiSettings;
  apiKey: string;
  conversationId: string;
  ctx: ToolContext;
  timezone?: string;  // IANA timezone from browser (e.g. "Asia/Ho_Chi_Minh")
}): Promise<ChatTurnResult> {
  const { settings, apiKey, conversationId, ctx, timezone } = opts;

  const messages = await loadMessages(conversationId);
  const sdkMessages = dbMessagesToSdk(messages);
  const tools = buildSdkTools(ctx);

  let result;
  try {
    result = await generateText({
      model: getModel(settings, apiKey),
      system: buildSystemPrompt(timezone),
      tools,
      messages: sdkMessages,
      // v5: stopWhen replaced maxSteps. stepCountIs(N) terminates after N steps.
      stopWhen: stepCountIs(MAX_STEPS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM API error";
    await appendMessage(conversationId, { role: "assistant", content: `⚠️ ${msg}` });
    const all = await loadMessages(conversationId);
    return { kind: "text", messages: all.map(toPublicMessage) };
  }

  // Persist every step. Each step has: text (assistant), toolCalls (tool_use),
  // toolResults (tool_result). Read tools auto-execute → both calls and
  // results are present. Write tools (no execute) → only call, no result.
  const pending: PendingToolCall[] = [];

  for (const step of result.steps) {
    if (step.text?.trim()) {
      await appendMessage(conversationId, { role: "assistant", content: step.text });
    }
    for (const call of step.toolCalls ?? []) {
      const meta = getToolMeta(call.toolName);
      const callArgs = readCallArgs(call);
      const matchingResult = step.toolResults?.find((r: any) => r.toolCallId === call.toolCallId);

      if (matchingResult) {
        // Auto-executed (read tool).
        await appendMessage(conversationId, {
          role: "tool_use",
          content: callArgs,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          toolStatus: "executed",
        });
        const { value, isError } = readToolResult(matchingResult);
        await appendMessage(conversationId, {
          role: "tool_result",
          content: value ?? null,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          toolStatus: isError ? "error" : "executed",
        });
      } else if (meta?.requiresConfirm) {
        // Write tool — pending confirm. Resolve display labels (tag/contact
        // names) via DB so the ConfirmCard shows human-readable text instead
        // of raw cuid IDs.
        const stored = await appendMessage(conversationId, {
          role: "tool_use",
          content: callArgs,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          toolStatus: "pending_confirm",
        });
        let summary = `Run ${call.toolName}`;
        if (meta.summary) {
          try { summary = await Promise.resolve(meta.summary(callArgs, ctx)); }
          catch { /* fall back to default */ }
        }
        pending.push({
          messageId: stored.id,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          args: callArgs,
          summary,
        });
      } else {
        // Unknown tool or write without meta — record error.
        await appendMessage(conversationId, {
          role: "tool_use",
          content: callArgs,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          toolStatus: "error",
        });
        await appendMessage(conversationId, {
          role: "tool_result",
          content: { error: `Unknown tool: ${call.toolName}` },
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          toolStatus: "error",
        });
      }
    }
  }

  // Dedup pending tool calls by toolName — LLM occasionally generates 2+
  // calls of the same write tool in one turn (typically when it self-corrects
  // a format error mid-response). Without dedup, user sees N confirm cards
  // for what's effectively 1 action. Keep the LAST (corrected) version;
  // DELETE the earlier tool_use rows so conversation reconstruction stays
  // consistent (every tool_use needs a matching tool_result, and we can't
  // create one for the rejected duplicate without confusing the LLM API
  // about which tool call the result belongs to).
  const dedupedPending: PendingToolCall[] = [];
  const seenByName = new Map<string, PendingToolCall>();
  for (const p of pending) {
    const prev = seenByName.get(p.toolName);
    if (prev) {
      await deleteMessage(prev.messageId);
    }
    seenByName.set(p.toolName, p);
  }
  for (const p of seenByName.values()) dedupedPending.push(p);

  const all = await loadMessages(conversationId);
  if (dedupedPending.length > 0) {
    return { kind: "pending_confirm", messages: all.map(toPublicMessage), pending: dedupedPending };
  }
  return { kind: "text", messages: all.map(toPublicMessage) };
}

// ─── Execute a confirmed (or rejected) write tool ────────────────────────────
// After persisting the tool_result, the caller continues the loop with another
// runChat() so the LLM can react to the outcome.

export async function executeConfirmedTool(opts: {
  conversationId: string;
  messageId: string;
  approve: boolean;
  ctx: ToolContext;
}): Promise<void> {
  const { conversationId, messageId, approve, ctx } = opts;

  const all = await loadMessages(conversationId);
  const message = all.find((m) => m.id === messageId && m.role === "tool_use");
  if (!message) throw new Error("Pending tool call not found");
  if (message.toolStatus !== "pending_confirm") {
    throw new Error(`Tool call already ${message.toolStatus}`);
  }

  const meta = getToolMeta(message.toolName!);
  if (!meta?.execute) throw new Error(`Tool not executable: ${message.toolName}`);

  if (!approve) {
    await updateMessageStatus(messageId, "rejected");
    await appendMessage(conversationId, {
      role: "tool_result",
      content: { rejected: true, reason: "User declined the action." },
      toolCallId: message.toolCallId!,
      toolName: message.toolName!,
      toolStatus: "rejected",
    });
    return;
  }

  await updateMessageStatus(messageId, "approved");
  try {
    const result = await meta.execute(message.content as Record<string, unknown>, ctx);
    await updateMessageStatus(messageId, "executed");
    await appendMessage(conversationId, {
      role: "tool_result",
      content: result,
      toolCallId: message.toolCallId!,
      toolName: message.toolName!,
      toolStatus: "executed",
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Tool execution failed";
    await updateMessageStatus(messageId, "error");
    await appendMessage(conversationId, {
      role: "tool_result",
      content: { error: errMsg },
      toolCallId: message.toolCallId!,
      toolName: message.toolName!,
      toolStatus: "error",
    });
  }
}
