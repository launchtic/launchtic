// Rewrite a page's marketing copy in place with the workspace LLM. Only text
// changes — element props (style, layout) and inline tags are never sent to
// the model, so the page keeps its design.
//
// Rich-text fields are split into text runs (the text between tags) and the
// model must return the same number of runs. That keeps per-run formatting,
// e.g. an orange "Get 50% off" followed by plain " for your first month".

import { generateObject } from "ai";
import { z } from "zod";
import { getAiSettings, getApiKey } from "../ai/settings";
import { getModel } from "../ai/llm";

type Field = {
  id: string;
  kind: string;
  runs: string[];
  write: (runs: string[]) => void;
};

export type RewriteChange = { id: string; kind: string; before: string; after: string };

// Form inputs, timers, prices and product blocks carry data or UI labels, not
// marketing copy — leave them alone.
const SKIP_KINDS = new Set([
  "Field", "Checkbox", "Countdown", "OfferPrice", "PhysicalProduct",
  "Coupon", "PaymentMethod", "Embed", "Menu",
]);

// Smaller batches keep cheaper models from dropping fields at the end of a long list.
const CHUNK_SIZE = 40;

const nameOf = (n: any): string =>
  (typeof n?.type === "string" ? n.type : n?.type?.resolvedName) ?? n?.displayName ?? "Element";

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const RUN_RE = />([^<>]+)</g;

function htmlRuns(html: string): string[] {
  if (!html.includes("<")) return html.trim() ? [decode(html)] : [];
  const runs: string[] = [];
  html.replace(RUN_RE, (full, txt: string) => {
    if (txt.trim()) runs.push(decode(txt));
    return full;
  });
  return runs;
}

// Keep each original run's surrounding whitespace so adjacent runs don't glue
// together when the model trims its answers.
function withSpacing(original: string, next: string): string {
  const lead = original.match(/^\s*/)?.[0] ?? "";
  const trail = original.match(/\s*$/)?.[0] ?? "";
  return lead + next.trim() + trail;
}

function writeHtmlRuns(html: string, original: string[], next: string[]): string {
  if (!html.includes("<")) return encode(withSpacing(original[0], next[0]));
  let i = 0;
  return html.replace(RUN_RE, (full, txt: string) => {
    if (!txt.trim()) return full;
    const out = `>${encode(withSpacing(original[i], next[i]))}<`;
    i++;
    return out;
  });
}

function collectFields(pageJson: any): Field[] {
  const out: Field[] = [];
  if (!pageJson || typeof pageJson !== "object") return out;

  const addHtml = (id: string, kind: string, html: string, set: (html: string) => void) => {
    const runs = htmlRuns(html);
    if (runs.length) out.push({ id, kind, runs, write: (next) => set(writeHtmlRuns(html, runs, next)) });
  };
  const addPlain = (id: string, kind: string, text: string, set: (text: string) => void) => {
    if (text.trim()) out.push({ id, kind, runs: [text], write: (next) => set(withSpacing(text, next[0])) });
  };

  for (const [nodeId, node] of Object.entries<any>(pageJson)) {
    const props = node?.props;
    if (!props || typeof props !== "object") continue;
    const kind = nameOf(node);
    if (SKIP_KINDS.has(kind)) continue;

    if (typeof props.rawContentState === "string" && props.rawContentState) {
      const raw = props.rawContentState;
      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch { /* raw html */ }
      if (parsed && typeof parsed.html === "string") {
        addHtml(`${nodeId}#rawContentState`, kind, parsed.html, (html) => {
          props.rawContentState = JSON.stringify({ ...parsed, html });
        });
      } else {
        addHtml(`${nodeId}#rawContentState`, kind, raw, (html) => { props.rawContentState = html; });
      }
    }
    for (const key of ["text", "subText"] as const) {
      if (typeof props[key] === "string") {
        addPlain(`${nodeId}#${key}`, kind, props[key], (t) => { props[key] = t; });
      }
    }
    if (props.imageDetail && typeof props.imageDetail.alt === "string") {
      addPlain(`${nodeId}#alt`, `${kind} (alt text)`, props.imageDetail.alt, (t) => { props.imageDetail.alt = t; });
    }
    if (Array.isArray(props.items)) {
      props.items.forEach((item: any, i: number) => {
        if (!item || typeof item !== "object") return;
        if (typeof item.text === "string") {
          addPlain(`${nodeId}#items.${i}.text`, `${kind} item`, item.text, (t) => { item.text = t; });
        }
        if (typeof item.questionHtml === "string") {
          addHtml(`${nodeId}#items.${i}.q`, `${kind} question`, item.questionHtml, (h) => { item.questionHtml = h; });
        }
        if (typeof item.answerHtml === "string") {
          addHtml(`${nodeId}#items.${i}.a`, `${kind} answer`, item.answerHtml, (h) => { item.answerHtml = h; });
        }
      });
    }
  }
  return out;
}

const SYSTEM_PROMPT = `You are a senior conversion copywriter. You rewrite the copy of an existing landing page so it fits a new business brief, while the page design stays exactly the same.

Input: a brief, then a list of text fields. Each field has an id, an element kind, and "runs" — consecutive text pieces of ONE sentence/paragraph that carry different formatting (e.g. run 1 is highlighted, run 2 is plain).

Output: one entry per field id with the rewritten runs.

Hard rules:
- Return an entry for EVERY field id you were given.
- Rewrite ALL marketing copy (headlines, descriptions, benefits, testimonials' quotes, buttons) in fresh wording for the brief — do not keep the original wording just because it already sounds acceptable.
- Return EXACTLY the same number of runs for every field, in the same order. Reading the runs in sequence must form natural text.
- Keep each run's role: a short highlighted run stays a short highlight; a headline stays a headline.
- Keep each run close to its original length (within about 25%) so the layout does not break. Buttons stay 2-5 words.
- Write in the language of the brief. If the brief does not imply a language, keep the page's current language.
- NEVER change prices, amounts, currencies, percentages, numbers, dates, coupon codes, URLs, emails or phone numbers unless the brief gives the new value. Copy them verbatim.
- Keep person names in testimonials unchanged. You may rewrite the quote itself, but no invented statistics or specific claims.
- Generic UI labels (e.g. "Submit", "Next", "Days", "Hours", copyright lines) — return them unchanged.
- Plain text only: no Markdown, no HTML, no surrounding quotes.`;

function buildPrompt(brief: string, fields: Field[]): string {
  const lines = fields.map((f) => JSON.stringify({ id: f.id, kind: f.kind, runs: f.runs.map((r) => r.trim()) }));
  return `Brief:\n${brief}\n\nFields (${fields.length}):\n${lines.join("\n")}`;
}

// SEO title + meta description for a page, written from the brief.
export async function generateSeoMeta(opts: {
  workspaceId: string;
  brief: string;
}): Promise<{ title: string; description: string }> {
  const settings = await getAiSettings(opts.workspaceId);
  const apiKey = settings?.enabled ? await getApiKey(opts.workspaceId) : null;
  if (!settings || !apiKey) return { title: "", description: "" };
  const { object } = await generateObject({
    model: getModel(settings, apiKey),
    schema: z.object({ title: z.string().max(80), description: z.string().max(200) }),
    system: "Write an SEO page title (max 60 characters) and meta description (max 155 characters) for a landing page, in the language of the brief. Plain text, no quotes.",
    prompt: `Brief:\n${opts.brief}`,
  });
  return object;
}

const parsePage = (pageJson: unknown): any =>
  typeof pageJson === "string" ? JSON.parse(pageJson || "{}") : JSON.parse(JSON.stringify(pageJson ?? {}));

// No AI call — how many text fields the page has, so the UI can show it up front.
export function scanPageCopy(pageJson: unknown): { total: number } {
  return { total: collectFields(parsePage(pageJson)).length };
}

const isValid = (field: Field, next: string[] | undefined): next is string[] =>
  !!next && next.length === field.runs.length && next.every((r) => r.trim());

const numbersIn = (s: string): string[] => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).sort();

// The prompt forbids changing numbers but models still do it (e.g. "10-15 min"
// → "20-30 min"), so enforce it in code:
//   - every number in the new text must come from the old text or the brief;
//   - every old number must survive, unless the brief supplies new numbers
//     (then the brief's value may legitimately replace it, e.g. a new price).
function changesNumbers(before: string, after: string, brief: string): boolean {
  const oldNums = numbersIn(before);
  const newNums = numbersIn(after);
  const briefNums = numbersIn(brief);
  const allowed = new Set([...oldNums, ...briefNums]);
  if (newNums.some((n) => !allowed.has(n))) return true;
  return briefNums.length === 0 && oldNums.some((n) => !newNums.includes(n));
}

export async function rewritePageCopy(opts: {
  workspaceId: string;
  pageJson: unknown;
  brief: string;
}): Promise<{
  pageJson: any;
  changes: RewriteChange[];
  total: number;      // text fields found on the page
  unchanged: number;  // model kept the text (fits the brief / UI label) or tried to alter a number
  failed: number;     // model omitted the field or broke its run count, even after a retry
}> {
  const settings = await getAiSettings(opts.workspaceId);
  if (!settings || !settings.enabled) {
    throw new Error("AI is not configured for this workspace. Add an API key in Settings → AI.");
  }
  const apiKey = await getApiKey(opts.workspaceId);
  if (!apiKey) throw new Error("AI API key not available for this workspace.");
  const model = getModel(settings, apiKey);

  const clone = parsePage(opts.pageJson);
  const fields = collectFields(clone);

  const schema = z.object({
    fields: z.array(z.object({ id: z.string(), runs: z.array(z.string()) })),
  });

  const answers = new Map<string, string[]>();
  const ask = async (batch: Field[]) => {
    const chunks: Field[][] = [];
    for (let i = 0; i < batch.length; i += CHUNK_SIZE) chunks.push(batch.slice(i, i + CHUNK_SIZE));
    const results = await Promise.all(chunks.map((chunk) =>
      generateObject({ model, schema, system: SYSTEM_PROMPT, prompt: buildPrompt(opts.brief, chunk) }),
    ));
    for (const { object } of results) for (const f of object.fields) answers.set(f.id, f.runs);
  };

  await ask(fields);
  // Models sometimes drop fields from long lists or merge runs — one retry for those.
  const missing = fields.filter((f) => !isValid(f, answers.get(f.id)));
  if (missing.length) await ask(missing);

  const changes: RewriteChange[] = [];
  let unchanged = 0;
  let failed = 0;
  for (const field of fields) {
    const next = answers.get(field.id);
    // A run-count mismatch would misalign formatting — keep the original.
    if (!isValid(field, next)) { failed++; continue; }
    // Joined with spaces for display — runs from separate blocks (list items,
    // paragraphs) carry no whitespace between them.
    const before = field.runs.join(" ").replace(/\s+/g, " ").trim();
    const after = field.runs.map((r, j) => withSpacing(r, next[j])).join(" ").replace(/\s+/g, " ").trim();
    if (before === after || changesNumbers(before, after, opts.brief)) { unchanged++; continue; }
    field.write(next);
    changes.push({ id: field.id, kind: field.kind, before, after });
  }

  return { pageJson: clone, changes, total: fields.length, unchanged, failed };
}
