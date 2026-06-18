// Reverse of ai-fill: take a fully-designed page (real copy, no slots) and let
// the LLM turn replaceable marketing copy into {{slot}} placeholders with
// semantic names — so a designer can build a page normally and we convert it
// into an AI-fillable template afterwards.
//
// Pipeline (mirrors ai-fill.ts):
//   1. collectTargets(pageJson)  — deterministic: find editable text + location.
//   2. assignSlots(...)          — LLM: pick which to slot + a semantic name.
//   3. applySlots(...)           — deterministic: rewrite text → {{slot}}.

import { generateObject } from "ai";
import { z } from "zod";
import { getAiSettings, getApiKey } from "../ai/settings";
import { getModel } from "../ai/llm";

type Target = {
  id: string;                 // stable: `${nodeId}#${field}` (+ item index)
  kind: string;               // element/displayName hint for the LLM
  text: string;               // current plain-text copy
  apply: (token: string) => void; // rewrites the source prop in place
  original: string;           // plain text (kept as sample-fill value)
};

const nameOf = (n: any) => (typeof n?.type === "string" ? n.type : n?.type?.resolvedName) ?? n?.displayName ?? "Element";
const stripTags = (html: unknown) =>
  String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

// Put the token in the first text run of the html, blank the rest — keeps the
// wrapper tags/styles (so {{slot}} renders inside the original element).
function htmlWithToken(html: string, token: string): string {
  let used = false;
  const out = String(html).replace(/>([^<>]+)</g, (full, txt) => {
    if (!txt.trim()) return full;
    if (!used) { used = true; return `>${token}<`; }
    return `><`;
  });
  return used ? out : token;
}

function setRich(props: any, key: string, token: string) {
  const raw = props[key];
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.html === "string") { props[key] = JSON.stringify({ ...parsed, html: htmlWithToken(parsed.html, token) }); return; }
  } catch { /* not JSON */ }
  props[key] = htmlWithToken(String(raw ?? ""), token);
}

export function collectTargets(pageJson: any): Target[] {
  const out: Target[] = [];
  if (!pageJson || typeof pageJson !== "object") return out;
  const push = (id: string, kind: string, text: string, apply: (t: string) => void) => {
    const t = text.trim();
    if (t) out.push({ id, kind, text: t, original: t, apply });
  };
  for (const [nodeId, node] of Object.entries<any>(pageJson)) {
    const props = node?.props;
    if (!props || typeof props !== "object") continue;
    const kind = nameOf(node);

    if (typeof props.rawContentState === "string" && props.rawContentState) {
      let html = props.rawContentState;
      try { html = JSON.parse(props.rawContentState).html ?? ""; } catch { /* raw */ }
      push(`${nodeId}#rawContentState`, kind, stripTags(html), (tok) => setRich(props, "rawContentState", tok));
    }
    for (const key of ["text", "subText"] as const) {
      if (typeof props[key] === "string") push(`${nodeId}#${key}`, kind, props[key], (tok) => { props[key] = tok; });
    }
    if (props.imageDetail && typeof props.imageDetail.alt === "string") {
      push(`${nodeId}#alt`, `${kind} (alt)`, props.imageDetail.alt, (tok) => { props.imageDetail.alt = tok; });
    }
    if (Array.isArray(props.items)) {
      props.items.forEach((item: any, i: number) => {
        if (!item || typeof item !== "object") return;
        if (typeof item.text === "string") push(`${nodeId}#items.${i}.text`, `${kind} item`, item.text, (tok) => { item.text = tok; });
        if (typeof item.questionHtml === "string") push(`${nodeId}#items.${i}.questionHtml`, `${kind} question`, stripTags(item.questionHtml), (tok) => { item.questionHtml = htmlWithToken(item.questionHtml, tok); });
        if (typeof item.answerHtml === "string") push(`${nodeId}#items.${i}.answerHtml`, `${kind} answer`, stripTags(item.answerHtml), (tok) => { item.answerHtml = htmlWithToken(item.answerHtml, tok); });
      });
    }
  }
  return out;
}

const SYSTEM_PROMPT = `You convert a designed landing page into a reusable template by turning REPLACEABLE marketing copy into {{slot}} placeholders.

You are given a list of text fragments, each with an id and an element kind. For each, decide:
- slot: a snake_case slot name if this text is replaceable per-business copy; or null to KEEP it as-is.

Rules for slot NAMES (critical — they drive later AI copywriting):
- Be SEMANTIC and prefixed by section + role: hero_headline, hero_description, hero_form_headline, hero_form_cta_text, hero_form_urgency_text, benefits_headline, benefit_1_title, benefit_1_desc, pricing_headline, cta_button_text, footer_tagline, etc.
- For repeated items (benefit/feature/testimonial/pricing lists) add an index: benefit_1_title, benefit_2_title…
- Unique names. snake_case, letters/digits/underscore only.

Set slot = null (KEEP literal) for FIXED UI text that should NOT change per business, e.g.:
- Form field placeholders ("First name", "Email"), nav links, button labels that are generic UI,
- Countdown labels ("DAYS", "HOURS"), footer legal/copyright, dates/times that are just layout,
- Anything that is a label rather than marketing copy.

Output one entry per input id.`;

export async function assignSlots(workspaceId: string, targets: Target[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!targets.length) return out;

  const settings = await getAiSettings(workspaceId);
  if (!settings || !settings.enabled) throw new Error("AI is not configured for this workspace. Add an API key in Settings → AI.");
  const apiKey = await getApiKey(workspaceId);
  if (!apiKey) throw new Error("AI API key not available for this workspace.");
  const model = getModel(settings, apiKey);

  const schema = z.object({
    assignments: z.array(z.object({ id: z.string(), slot: z.string().max(60).nullable() })),
  });
  const prompt = "Fragments:\n" + targets.map((t) => `- [${t.id}] (${t.kind}) ${JSON.stringify(t.text)}`).join("\n");

  const { object } = await generateObject({ model, schema, system: SYSTEM_PROMPT, prompt });

  const seen = new Set<string>();
  for (const a of object.assignments) {
    if (!a.slot) continue;
    let slot = a.slot.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
    if (!slot) continue;
    let unique = slot, n = 2;
    while (seen.has(unique)) unique = `${slot}_${n++}`;
    seen.add(unique);
    out.set(a.id, unique);
  }
  return out;
}

// Run the full pipeline. Returns the slotified pageJson + the slot list +
// a sample map (original copy) usable as the template's preview/sample-fill.
export async function aiSlotify(opts: { workspaceId: string; pageJson: any }): Promise<{
  pageJson: any; slots: string[]; sample: Record<string, string>; count: number;
}> {
  const clone = JSON.parse(JSON.stringify(opts.pageJson));
  const targets = collectTargets(clone);
  const assignments = await assignSlots(opts.workspaceId, targets);

  const sample: Record<string, string> = {};
  for (const t of targets) {
    const slot = assignments.get(t.id);
    if (!slot) continue;
    t.apply(`{{${slot}}}`);
    sample[slot] = t.original;
  }
  const slots = Object.keys(sample);
  return { pageJson: clone, slots, sample, count: slots.length };
}
