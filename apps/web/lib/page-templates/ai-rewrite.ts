// Rewrite a page's marketing copy in place with the workspace LLM. Only text
// changes — element props (style, layout) and inline tags are never sent to
// the model, so the page keeps its design.
//
// Rich-text fields are split into text runs (the text between tags) and the
// model must return the same number of runs. That keeps per-run formatting,
// e.g. an orange "Get 50% off" followed by plain " for your first month".
//
// Two modes share one pipeline:
//   rewritePageCopy — whole page, written for a new business brief.
//   editPageCopy    — one section/element, edited per an instruction.

import { generateObject } from "ai";
import { z } from "zod";
import { getAiSettings, getApiKey } from "../ai/settings";
import { getModel } from "../ai/llm";

type Field = {
  id: string;
  nodeId: string;
  kind: string;
  section: number;   // 1-based top-level section the field sits in (0 = unknown)
  group?: string;    // e.g. "column 2/4" — parallel items in a multi-column row
  runs: string[];
  write: (runs: string[]) => void;
};

export type RewriteChange = { id: string; kind: string; before: string; after: string };

type JobResult = {
  clone: any;
  fields: Field[];
  changes: RewriteChange[];
  unchanged: number;  // model kept the text, or tried to alter a number
  failed: number;     // model omitted the field or broke its run count, even after a retry
};

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

// Rich text split into tags and text runs. Each run remembers its block (list
// item / paragraph / heading) so every block becomes its own field: a model
// that mangles one bullet then doesn't cost the whole list.
type Rich = { tokens: string[]; runToken: number[]; runs: string[]; blocks: number[] };

const TOKEN_RE = /<[^>]+>|[^<]+/g;
const BLOCK_BREAK = /^<(\/(p|li|div|h[1-6]|blockquote)|br)\b/i;

function parseRich(html: string): Rich {
  const tokens = html.match(TOKEN_RE) ?? [];
  const rich: Rich = { tokens, runToken: [], runs: [], blocks: [] };
  let block = 0;
  let blockHasRun = false;
  tokens.forEach((t, i) => {
    if (t.startsWith("<")) {
      if (blockHasRun && BLOCK_BREAK.test(t)) { block++; blockHasRun = false; }
      return;
    }
    if (!t.trim()) return;
    rich.runToken.push(i);
    rich.runs.push(decode(t));
    rich.blocks.push(block);
    blockHasRun = true;
  });
  return rich;
}

// values are already spaced (see spaceRuns) — written verbatim.
function renderRich(rich: Rich, values: string[]): string {
  const out = [...rich.tokens];
  rich.runToken.forEach((ti, k) => { out[ti] = encode(values[k]); });
  return out.join("");
}

// Whitespace for a field's new runs. The block's outer edges keep the
// original whitespace. Between runs the model's own spacing wins — a
// formatting split can fall mid-word ("Khẩu ph" + "ần…"), so the original
// boundary says nothing about the new words — but where the original had a
// space and the model trimmed it, put one back so words don't glue.
function spaceRuns(original: string[], next: string[]): string[] {
  const out = next.map((s) => s.replace(/\s+/g, " "));
  const last = out.length - 1;
  out[0] = (original[0].match(/^\s*/)?.[0] ?? "") + out[0].replace(/^\s+/, "");
  out[last] = out[last].replace(/\s+$/, "") + (original[last].match(/\s*$/)?.[0] ?? "");
  for (let j = 0; j < last; j++) {
    const modelSpaced = /\s$/.test(out[j]) || /^\s/.test(out[j + 1]);
    const originalSpaced = /\s$/.test(original[j]) || /^\s/.test(original[j + 1]);
    if (!modelSpaced && originalSpaced && out[j].trim() && out[j + 1].trim()) out[j] += " ";
  }
  return out;
}

const deviceTag = (props: any): string => {
  const a = props?.appearance;
  if (a?.desktop === false && a?.mobile !== false) return " (mobile only)";
  if (a?.mobile === false && a?.desktop !== false) return " (desktop only)";
  return "";
};

// Text fields of one node, in reading order.
function nodeFields(nodeId: string, node: any, section: number, group: string | undefined, out: Field[]) {
  const props = node?.props;
  if (!props || typeof props !== "object") return;
  const kind = nameOf(node) + deviceTag(props);
  if (SKIP_KINDS.has(nameOf(node))) return;

  const base = { nodeId, section, group };
  // One field per block; all blocks write into a shared value list and the
  // html is re-rendered from it, so several blocks of one element can change.
  const addHtml = (id: string, k: string, html: string, set: (html: string) => void) => {
    const rich = parseRich(html);
    if (!rich.runs.length) return;
    const values = [...rich.runs];
    const blockCount = rich.blocks[rich.blocks.length - 1] + 1;
    const unit = k.startsWith("BulletedList") ? "item" : "paragraph";
    for (let b = 0; b < blockCount; b++) {
      const idx = rich.blocks.flatMap((blk, i) => (blk === b ? [i] : []));
      if (!idx.length) continue;
      out.push({
        ...base,
        id: blockCount > 1 ? `${id}.b${b}` : id,
        kind: blockCount > 1 ? `${k} ${unit} ${b + 1}` : k,
        runs: idx.map((i) => rich.runs[i]),
        write: (next) => {
          idx.forEach((i, j) => { values[i] = next[j]; });
          set(renderRich(rich, values));
        },
      });
    }
  };
  const addPlain = (id: string, k: string, text: string, set: (text: string) => void) => {
    if (text.trim()) out.push({ ...base, id, kind: k, runs: [text], write: (next) => set(next[0]) });
  };

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

const childrenOf = (node: any): string[] => [...(node?.nodes ?? []), ...Object.values<string>(node?.linkedNodes ?? {})];

// 1-based index of the top-level section containing nodeId.
function sectionOf(pageJson: any, nodeId: string): number {
  const top: string[] = pageJson.ROOT?.nodes ?? [];
  let cur: string | undefined = nodeId;
  for (let guard = 0; cur && guard < 200; guard++) {
    const i = top.indexOf(cur);
    if (i >= 0) return i + 1;
    cur = pageJson[cur]?.parent;
  }
  return 0;
}

// Fields in visual (top-to-bottom) order: walk the craft tree from ROOT, or
// from scopeNodeId when editing one section/element. Hidden and unreachable
// nodes are skipped — they don't render.
function collectFields(pageJson: any, scopeNodeId?: string): Field[] {
  const out: Field[] = [];
  if (!pageJson || typeof pageJson !== "object") return out;

  const seen = new Set<string>();
  const visit = (id: string, section: number, group?: string) => {
    const node = pageJson[id];
    if (!node || seen.has(id) || node.hidden) return;
    seen.add(id);
    nodeFields(id, node, section, group, out);
    const kids = childrenOf(node);
    const cols = nameOf(node) === "Row" ? kids.filter((c) => nameOf(pageJson[c]) === "Column") : [];
    for (const c of kids) {
      const i = cols.indexOf(c);
      visit(c, section, cols.length >= 2 && i >= 0 ? `column ${i + 1}/${cols.length}` : group);
    }
  };

  if (scopeNodeId) {
    visit(scopeNodeId, sectionOf(pageJson, scopeNodeId));
  } else if (pageJson.ROOT) {
    (pageJson.ROOT.nodes ?? []).forEach((id: string, i: number) => visit(id, i + 1));
  } else {
    // Not a craft page tree — fall back to whatever order the map has.
    for (const [id, node] of Object.entries<any>(pageJson)) nodeFields(id, node, 0, undefined, out);
  }
  return out;
}

// Runs of one field are consecutive pieces of the same block — join as-is
// (they carry their own spacing; a formatting split can fall mid-word).
const joinRuns = (runs: string[]) => runs.join("").replace(/\s+/g, " ").trim();
const plain = (f: Field) => joinRuns(f.runs);

// Section number → its title: the first headline, else the first text.
function outlineOf(fields: Field[]): Map<number, string> {
  const outline = new Map<number, string>();
  const title = (f: Field) => plain(f).slice(0, 70);
  for (const f of fields) {
    if (f.section && f.kind.startsWith("Headline") && !outline.has(f.section)) outline.set(f.section, title(f));
  }
  for (const f of fields) {
    if (f.section && !outline.has(f.section)) outline.set(f.section, title(f));
  }
  return outline;
}

const COMMON_RULES = `- Return an entry for EVERY field id you were given.
- Placeholder / dummy text (Lorem ipsum and other Latin filler, "Your headline here", "Add your description") has no meaning to keep or translate — ALWAYS replace it with real copy that fits its surrounding fields and the page, written in the language the rest of the result uses. This applies even when the request is only a translation or a tone change.
- Return EXACTLY the same number of runs for every field, in the same order. Reading the runs in sequence must form natural text.
- Runs are given verbatim, including leading/trailing spaces. A run boundary may fall inside a word (formatting applied to part of a word) — you may move it to a word edge. Wherever a new word starts in the next run, end your run with a space.
- Keep each run's role: a short highlighted run stays a short highlight; a headline stays a headline.
- Fields are listed top-to-bottom, grouped by page section. Fields tagged "column k/n" are parallel items (cards) in one row — keep their structure, tone and length consistent with each other.
- Fields tagged "(mobile only)" / "(desktop only)" are device variants of the same content — give them the same wording as their counterpart.
- NEVER change prices, amounts, currencies, percentages, numbers, dates, coupon codes, URLs, emails or phone numbers unless the request gives the new value. Copy them verbatim.
- Generic UI labels (e.g. "Submit", "Next", "Days", "Hours", copyright lines) — return them unchanged.
- Plain text only: no Markdown, no HTML, no surrounding quotes.`;

const REWRITE_PROMPT = `You are a senior conversion copywriter. You rewrite the copy of an existing landing page so it fits a new business brief, while the page design stays exactly the same.

Input: a brief, an outline of the page's sections, then the text fields. Each field has an id, an element kind, and "runs" — consecutive text pieces of ONE sentence/paragraph that carry different formatting (e.g. run 1 is highlighted, run 2 is plain).

Output: one entry per field id with the rewritten runs.

Hard rules:
- Rewrite ALL marketing copy (headlines, descriptions, benefits, testimonials' quotes, buttons) in fresh wording for the brief — do not keep the original wording just because it already sounds acceptable. Keep the page's story coherent from the first section to the last.
- Keep each run close to its original length (within about 25%) so the layout does not break. Buttons stay 2-5 words.
- Write in the language of the brief. If the brief does not imply a language, keep the page's current language.
- Keep person names in testimonials unchanged. You may rewrite the quote itself, but no invented statistics or specific claims.
${COMMON_RULES}`;

const EDIT_PROMPT = `You are a senior conversion copywriter editing PART of an existing landing page. The page design stays exactly the same; only text changes.

Input: an instruction, an outline of the whole page (context only — do not edit it), then the text fields of the part being edited. Each field has an id, an element kind, and "runs" — consecutive text pieces of ONE sentence/paragraph that carry different formatting.

Output: one entry per field id with the edited runs.

Hard rules:
- Apply the instruction to these fields only. Change only what the instruction asks; fields it does not affect must be returned unchanged.
- Keep each run close to its original length unless the instruction asks for shorter or longer text.
- Language: keep each field in the language it is already written in. The language the instruction itself is typed in means NOTHING — "make it shorter" typed in Spanish about English text must still return English. Switch language only when the instruction explicitly asks to translate or to write in a named language; then translate faithfully, don't reword.
- Keep brand, product and person names unless the instruction says otherwise.
- Stay consistent with the rest of the page (product, brand, tone) shown in the outline.
${COMMON_RULES}`;

const fieldLine = (f: Field) =>
  JSON.stringify({ id: f.id, kind: f.kind, ...(f.group ? { group: f.group } : {}), runs: f.runs.map((r) => r.replace(/\s+/g, " ")) });

function buildPrompt(header: string, outline: Map<number, string>, fields: Field[]): string {
  const parts = [header, ""];
  if (outline.size) {
    parts.push("Page outline (sections top to bottom):");
    for (const [n, title] of [...outline].sort((a, b) => a[0] - b[0])) parts.push(`${n}. "${title}"`);
    parts.push("");
  }
  parts.push(`Fields (${fields.length}):`);
  let section = -1;
  for (const f of fields) {
    if (f.section !== section) {
      section = f.section;
      if (section) parts.push(`## Section ${section}${outline.get(section) ? ` — "${outline.get(section)}"` : ""}`);
    }
    parts.push(fieldLine(f));
  }
  return parts.join("\n");
}

// Batches of whole sections (a section larger than CHUNK_SIZE is split), so
// cards in one section are written together.
function chunkBySection(fields: Field[]): Field[][] {
  const chunks: Field[][] = [];
  let cur: Field[] = [];
  let i = 0;
  while (i < fields.length) {
    let j = i;
    while (j < fields.length && fields[j].section === fields[i].section) j++;
    const section = fields.slice(i, j);
    if (cur.length && cur.length + section.length > CHUNK_SIZE) { chunks.push(cur); cur = []; }
    for (let k = 0; k < section.length; k += CHUNK_SIZE) {
      const piece = section.slice(k, k + CHUNK_SIZE);
      if (piece.length === CHUNK_SIZE) chunks.push(piece);
      else cur.push(...piece);
    }
    i = j;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

const hasText = (next: string[] | undefined): next is string[] => !!next && next.join("").trim().length > 0;

// Exact fit: same run count, so every run keeps its own formatting.
const isExact = (field: Field, next: string[] | undefined): next is string[] =>
  hasText(next) && next.length === field.runs.length;

// Model merged or split runs (common when a formatting change falls mid-word,
// e.g. "Khẩu ph" + coloured "ần…"). Keep the text: put it all in the block's
// first run (its formatting wins) and blank the rest.
function fitRuns(field: Field, next: string[]): { runs: string[]; simplified: boolean } {
  if (next.length === field.runs.length) return { runs: next, simplified: false };
  const merged = next.map((r) => r.trim()).filter(Boolean).join(" ");
  return { runs: [merged, ...Array(field.runs.length - 1).fill("")], simplified: true };
}

const numbersIn = (s: string): string[] => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).sort();

// The prompt forbids changing numbers but models still do it (e.g. "10-15 min"
// → "20-30 min"), so enforce it in code:
//   - every number in the new text must come from the old text or the request;
//   - every old number must survive, unless the request supplies new numbers
//     (then the request's value may legitimately replace it, e.g. a new price).
function changesNumbers(before: string, after: string, request: string): boolean {
  const oldNums = numbersIn(before);
  const newNums = numbersIn(after);
  const requestNums = numbersIn(request);
  const allowed = new Set([...oldNums, ...requestNums]);
  if (newNums.some((n) => !allowed.has(n))) return true;
  return requestNums.length === 0 && oldNums.some((n) => !newNums.includes(n));
}

const parsePage = (pageJson: unknown): any =>
  typeof pageJson === "string" ? JSON.parse(pageJson || "{}") : JSON.parse(JSON.stringify(pageJson ?? {}));

async function modelFor(workspaceId: string) {
  const settings = await getAiSettings(workspaceId);
  if (!settings || !settings.enabled) {
    throw new Error("AI is not configured for this workspace. Add an API key in Settings → AI.");
  }
  const apiKey = await getApiKey(workspaceId);
  if (!apiKey) throw new Error("AI API key not available for this workspace.");
  return getModel(settings, apiKey);
}

async function runCopyJob(opts: {
  workspaceId: string;
  pageJson: unknown;
  scopeNodeId?: string;
  system: string;
  header: string;
  request: string;  // the brief / instruction — numbers in it may legitimately appear
}): Promise<JobResult> {
  const model = await modelFor(opts.workspaceId);
  const clone = parsePage(opts.pageJson);
  const outline = outlineOf(collectFields(clone));
  const fields = collectFields(clone, opts.scopeNodeId);

  const schema = z.object({
    fields: z.array(z.object({ id: z.string(), runs: z.array(z.string()) })),
  });

  const answers = new Map<string, string[]>();
  const ask = async (batch: Field[]) => {
    const results = await Promise.all(chunkBySection(batch).map((chunk) =>
      generateObject({ model, schema, system: opts.system, prompt: buildPrompt(opts.header, outline, chunk) }),
    ));
    for (const { object } of results) for (const f of object.fields) answers.set(f.id, f.runs);
  };

  await ask(fields);
  // Models sometimes drop fields from long lists or merge runs — one retry for those.
  const missing = fields.filter((f) => !isExact(f, answers.get(f.id)));
  if (missing.length) {
    const first = new Map(missing.map((f) => [f.id, answers.get(f.id)]));
    await ask(missing);
    // Keep the first answer if the retry came back worse (e.g. omitted).
    for (const f of missing) if (!hasText(answers.get(f.id)) && hasText(first.get(f.id))) answers.set(f.id, first.get(f.id)!);
  }

  const changes: RewriteChange[] = [];
  let unchanged = 0;
  let failed = 0;
  for (const field of fields) {
    const answer = answers.get(field.id);
    if (!hasText(answer)) { failed++; continue; }
    const fitted = fitRuns(field, answer);
    const next = spaceRuns(field.runs, fitted.runs);
    const simplified = fitted.simplified;
    const before = plain(field);
    const after = joinRuns(next);
    if (before === after || changesNumbers(before, after, opts.request)) { unchanged++; continue; }
    field.write(next);
    changes.push({ id: field.id, kind: simplified ? `${field.kind} · formatting simplified` : field.kind, before, after });
  }
  return { clone, fields, changes, unchanged, failed };
}

// No AI call — how many text fields the page (or one node) has, so the UI can show it up front.
export function scanPageCopy(pageJson: unknown, scopeNodeId?: string): { total: number } {
  return { total: collectFields(parsePage(pageJson), scopeNodeId).length };
}

export async function rewritePageCopy(opts: {
  workspaceId: string;
  pageJson: unknown;
  brief: string;
}): Promise<{ pageJson: any; changes: RewriteChange[]; total: number; unchanged: number; failed: number }> {
  const r = await runCopyJob({
    workspaceId: opts.workspaceId,
    pageJson: opts.pageJson,
    system: REWRITE_PROMPT,
    header: `Brief:\n${opts.brief}`,
    request: opts.brief,
  });
  return { pageJson: r.clone, changes: r.changes, total: r.fields.length, unchanged: r.unchanged, failed: r.failed };
}

// Edit the text inside one section/element per an instruction. Returns the new
// props of each changed node so the editor can apply them in place.
export async function editPageCopy(opts: {
  workspaceId: string;
  pageJson: unknown;
  scopeNodeId: string;
  instruction: string;
}): Promise<{ updates: Record<string, any>; changes: RewriteChange[]; total: number; unchanged: number; failed: number }> {
  const r = await runCopyJob({
    workspaceId: opts.workspaceId,
    pageJson: opts.pageJson,
    scopeNodeId: opts.scopeNodeId,
    system: EDIT_PROMPT,
    header: `Instruction:\n${opts.instruction}`,
    request: opts.instruction,
  });
  const changedNodes = new Set(r.changes.map((c) => c.id.split("#")[0]));
  const updates: Record<string, any> = {};
  for (const nodeId of changedNodes) updates[nodeId] = r.clone[nodeId]?.props;
  return { updates, changes: r.changes, total: r.fields.length, unchanged: r.unchanged, failed: r.failed };
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
