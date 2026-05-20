// Call the workspace's configured LLM to fill template slots with copy
// matching the user's brief. Uses Vercel AI SDK's generateObject for
// structured JSON output (no parsing — schema is enforced).

import { generateObject } from "ai";
import { z } from "zod";
import { getAiSettings, getApiKey } from "../ai/settings";
import { getModel } from "../ai/llm";

export type AiBrief = {
  industry: string;
  tone?: string;
  audience?: string;
  notes?: string;
  productPrice?: string; // exact price string — AI must use verbatim for price slots
};

const SYSTEM_PROMPT = `You are a senior landing page copywriter.

Your job: fill placeholder slots in a landing page template with high-quality, conversion-focused copy that matches the brief.

Rules:
- Each slot gets ONE concise string. Match the typical length of that slot type:
  - headline / title slots: 3-12 words, attention-grabbing
  - subheadline / description slots: 1-2 sentences
  - button / CTA slots: 2-5 words, action verb
  - feature / benefit slots: short benefit-driven phrases
  - testimonial slots: realistic quotes (not generic)
  - alt text slots: descriptive but brief
- Slot names hint at intent — "hero_headline" → main hero headline. Read the name carefully.
- Stay consistent in voice across all slots — same brand persona.
- Write copy in the SAME LANGUAGE as the brief (industry / audience / notes fields).
  Default to English only if all brief fields are empty / English. Templates are
  language-neutral — the placeholder text being English doesn't constrain you.
- DO NOT include the slot syntax {{...}} in your output. Only the literal text.
- DO NOT add Markdown, HTML, or quotes around values.
- DO NOT invent statistics, prices, or specific claims unless the brief mentions them.
- NEVER convert, reformat, or replace any price, amount, or currency symbol mentioned in the brief.
  If the brief says "$30 USD", write "$30" or "$30 USD" exactly — do NOT convert to any other currency (e.g. VND, EUR) regardless of the language you are writing in.
  Language and currency are independent.`;

function buildUserPrompt(slots: string[], brief: AiBrief): string {
  const parts: string[] = [];
  parts.push(`Industry / niche: ${brief.industry}`);
  if (brief.tone) parts.push(`Tone: ${brief.tone}`);
  if (brief.audience) parts.push(`Target audience: ${brief.audience}`);
  if (brief.notes) parts.push(`Additional notes: ${brief.notes}`);
  if (brief.productPrice) {
    parts.push("");
    parts.push(`FIXED PRICE: ${brief.productPrice}`);
    parts.push(`For any slot that represents a price, cost, or monetary value — use exactly "${brief.productPrice}". Do not change, round, or convert it.`);
  }
  parts.push("");
  parts.push(`Fill the following ${slots.length} slot(s). Return one string per slot.`);
  parts.push("");
  parts.push("Slots:");
  for (const s of slots) parts.push(`- ${s}`);
  return parts.join("\n");
}

export async function fillSlotsWithAI(opts: {
  workspaceId: string;
  slots: string[];
  brief: AiBrief;
}): Promise<Record<string, string>> {
  if (opts.slots.length === 0) return {};

  const settings = await getAiSettings(opts.workspaceId);
  if (!settings || !settings.enabled) {
    throw new Error("AI is not configured for this workspace. Add an API key in Settings → AI.");
  }
  const apiKey = await getApiKey(opts.workspaceId);
  if (!apiKey) {
    throw new Error("AI API key not available for this workspace.");
  }

  const model = getModel(settings, apiKey);

  // Build a Zod schema where each slot must have a non-empty string value.
  // generateObject enforces this at the SDK boundary — if the model returns
  // anything else, the SDK retries / errors instead of us silently accepting
  // malformed output.
  const shape: Record<string, z.ZodString> = {};
  for (const slot of opts.slots) {
    shape[slot] = z.string().min(1).max(500);
  }
  const schema = z.object(shape);

  const { object } = await generateObject({
    model,
    schema,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(opts.slots, opts.brief),
  });

  return object as Record<string, string>;
}

