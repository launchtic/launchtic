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
  lineStarts?: number[];  // run indexes that begin a new line (paragraph / <br>)
  // label: interface text (placeholders, timer units, menu items, button states).
  // legal: consent wording. Both are only ever translated, never reworded.
  role?: "label" | "legal";
  runs: string[];
  write: (runs: string[]) => void;
};

type Role = Field["role"];

export type RewriteChange = { id: string; kind: string; before: string; after: string };

type JobResult = {
  clone: any;
  fields: Field[];
  changes: RewriteChange[];
  unchanged: number;  // model kept the text, or tried to alter a number
  failed: number;     // model omitted the field or broke its run count, even after a retry
};

// Prices, products and payment methods render data from the product/plan
// records — editing their text on the page would contradict that data.
const SKIP_KINDS = new Set(["OfferPrice", "PhysicalProduct", "PaymentMethod", "Embed"]);

// Top-level interface-label props per element (role "label").
const LABEL_PROPS: Record<string, string[]> = {
  Countdown: ["daysLabel", "hoursLabel", "minutesLabel", "secondsLabel"],
  Coupon: ["placeholder", "buttonText"],
  PaymentButton: ["loadingText", "validationText"],
  Checkbox: ["validationMessage"],
};

// Marketing copy props beyond rawContentState/text/subText.
const COPY_PROPS: Record<string, string[]> = {
  OrderBump: ["orderBumpName"],
};

// Smaller batches keep cheaper models from dropping fields at the end of a long list.
const CHUNK_SIZE = 40;

const nameOf = (n: any): string =>
  (typeof n?.type === "string" ? n.type : n?.type?.resolvedName) ?? n?.displayName ?? "Element";

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Rich text split into tags and text runs. Each run remembers its list item
// (block) and its line (paragraph/heading/<br>). Every list item becomes its
// own field — a model that mangles one bullet then doesn't cost the whole
// list — while the lines of a Text/Headline stay in one field, because a
// sentence is often broken over lines just for looks ("SECURED WITH 256-BIT" /
// "ENCRYPTION") and must be rewritten as a whole.
type Rich = { tokens: string[]; runToken: number[]; runs: string[]; blocks: number[]; lines: number[] };

const TOKEN_RE = /<[^>]+>|[^<]+/g;
const ITEM_BREAK = /^<\/li\b/i;
const LINE_BREAK = /^<(\/(p|li|div|h[1-6]|blockquote)|br)\b/i;

function parseRich(html: string): Rich {
  const tokens = html.match(TOKEN_RE) ?? [];
  const rich: Rich = { tokens, runToken: [], runs: [], blocks: [], lines: [] };
  let block = 0;
  let line = 0;
  let blockHasRun = false;
  let lineHasRun = false;
  tokens.forEach((t, i) => {
    if (t.startsWith("<")) {
      if (lineHasRun && LINE_BREAK.test(t)) { line++; lineHasRun = false; }
      if (blockHasRun && ITEM_BREAK.test(t)) { block++; blockHasRun = false; }
      return;
    }
    if (!t.trim()) return;
    rich.runToken.push(i);
    rich.runs.push(decode(t));
    rich.blocks.push(block);
    rich.lines.push(line);
    blockHasRun = lineHasRun = true;
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
  const name = nameOf(node);
  const kind = name + deviceTag(props);
  if (SKIP_KINDS.has(name)) return;

  const base = { nodeId, section, group };
  // One field per block; all blocks write into a shared value list and the
  // html is re-rendered from it, so several blocks of one element can change.
  const addHtml = (id: string, k: string, html: string, set: (html: string) => void, role?: Role) => {
    const rich = parseRich(html);
    if (!rich.runs.length) return;
    const values = [...rich.runs];
    const blockCount = rich.blocks[rich.blocks.length - 1] + 1;
    for (let b = 0; b < blockCount; b++) {
      const idx = rich.blocks.flatMap((blk, i) => (blk === b ? [i] : []));
      if (!idx.length) continue;
      out.push({
        ...base,
        role,
        id: blockCount > 1 ? `${id}.b${b}` : id,
        kind: blockCount > 1 ? `${k} item ${b + 1}` : k,
        runs: idx.map((i) => rich.runs[i]),
        lineStarts: idx.flatMap((i, j) => (j > 0 && rich.lines[i] !== rich.lines[idx[j - 1]] ? [j] : [])),
        write: (next) => {
          idx.forEach((i, j) => { values[i] = next[j]; });
          set(renderRich(rich, values));
        },
      });
    }
  };
  const addPlain = (id: string, k: string, text: string, set: (text: string) => void, role?: Role) => {
    if (text.trim()) out.push({ ...base, role, id, kind: k, runs: [text], write: (next) => set(next[0]) });
  };

  if (typeof props.rawContentState === "string" && props.rawContentState) {
    const raw = props.rawContentState;
    // A Checkbox's text is the consent the visitor agrees to.
    const role: Role = name === "Checkbox" ? "legal" : undefined;
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* raw html */ }
    if (parsed && typeof parsed.html === "string") {
      addHtml(`${nodeId}#rawContentState`, kind, parsed.html, (html) => {
        props.rawContentState = JSON.stringify({ ...parsed, html });
      }, role);
    } else {
      addHtml(`${nodeId}#rawContentState`, kind, raw, (html) => { props.rawContentState = html; }, role);
    }
  }
  for (const key of ["text", "subText", ...(COPY_PROPS[name] ?? [])]) {
    if (typeof props[key] === "string") {
      addPlain(`${nodeId}#${key}`, kind, props[key], (t) => { props[key] = t; });
    }
  }
  for (const key of LABEL_PROPS[name] ?? []) {
    if (typeof props[key] === "string") {
      addPlain(`${nodeId}#${key}`, `${kind} ${key}`, props[key], (t) => { props[key] = t; }, "label");
    }
  }
  if (name === "Field" && typeof props.inputDetail?.placeholder === "string") {
    addPlain(`${nodeId}#placeholder`, `${kind} placeholder`, props.inputDetail.placeholder, (t) => { props.inputDetail.placeholder = t; }, "label");
  }
  if (props.imageDetail && typeof props.imageDetail.alt === "string") {
    addPlain(`${nodeId}#alt`, `${kind} (alt text)`, props.imageDetail.alt, (t) => { props.imageDetail.alt = t; });
  }
  if (Array.isArray(props.items)) {
    const itemRole: Role = name === "Menu" ? "label" : undefined;
    props.items.forEach((item: any, i: number) => {
      if (!item || typeof item !== "object") return;
      if (typeof item.text === "string") {
        addPlain(`${nodeId}#items.${i}.text`, `${kind} item`, item.text, (t) => { item.text = t; }, itemRole);
      }
      (Array.isArray(item.submenuItems) ? item.submenuItems : []).forEach((sub: any, j: number) => {
        if (typeof sub?.text === "string") {
          addPlain(`${nodeId}#items.${i}.sub.${j}`, `${kind} submenu item`, sub.text, (t) => { sub.text = t; }, itemRole);
        }
      });
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
// (Runs on separate lines get a space so they read as words, not glued.)
const joinRuns = (runs: string[], lineStarts: number[] = []) =>
  runs.map((r, j) => (lineStarts.includes(j) ? " " : "") + r).join("").replace(/\s+/g, " ").trim();
const plain = (f: Field) => joinRuns(f.runs, f.lineStarts);

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

// Prompts are split into what the model may change freely (the wording) and
// the few things it must keep fixed. Over-constraining made cheap models play
// safe and return text unchanged, so the freedom is stated explicitly.

const COMMON_RULES = `Format — required so the page design survives:
- Return an entry for EVERY field id, with EXACTLY the same number of runs in the same order. Runs are given verbatim (spaces included); read in sequence they form the field's text.
- A run boundary may fall inside a word (formatting on part of a word) — you may move it to a word edge. End a run with a space wherever the next run starts a new word.
- Runs of one field on separate lines are usually ONE sentence broken for layout: write the whole sentence, then split it across the runs — e.g. ["SECURED WITH 256-BIT ", "ENCRYPTION"] into Spanish → ["PROTEGIDO CON CIFRADO ", "DE 256 BITS"].
- Plain text only: no Markdown, no HTML, no surrounding quotes.

Keep fixed:
- Numbers, prices, currencies, percentages, dates, coupon codes, URLs, emails, phone numbers — copy them verbatim unless the request gives new values.
- Fields with "role": "label" (form input hints, countdown units, menu items, button loading/validation messages) and "role": "legal" (consent wording the visitor agrees to): never reword them. Only translate them — faithfully, keeping every condition of legal text — when the page's copy is being written in another language.
- Fields tagged "(mobile only)" / "(desktop only)" are device variants of the same content — same wording as their counterpart.

Always fix:
- Dummy filler copy (Lorem ipsum, "Your headline here", "Add your description") — replace it with real copy that fits its context, even if the request is only a translation or a tone change.

Context:
- Fields are listed top-to-bottom, grouped by page section. Fields tagged "column k/n" are parallel items (cards) in one row — keep them consistent with each other.
- When translating, leave no source-language words behind.`;

const REWRITE_PROMPT = `You are a senior conversion copywriter. Rewrite the copy of an existing landing page for a new business brief; the page design stays exactly the same.

Input: a brief, an outline of the page's sections, then its text fields. Each field has an id, an element kind and "runs" — consecutive pieces of one text that carry different formatting.

You have full creative freedom over the wording: write every headline, description, benefit, testimonial quote and button fresh for the brief, and keep the story coherent from the first section to the last. Keep lengths roughly similar so the layout holds (buttons stay short). Write in the language of the brief (if it implies none, keep the page's language). Don't invent statistics or specific claims, and keep testimonial authors' names.

${COMMON_RULES}`;

const EDIT_PROMPT = `You are a senior conversion copywriter editing an existing landing page, or one part of it; the page design stays exactly the same.

Input: an instruction, an outline of the whole page (context only), then the text fields to edit. Each field has an id, an element kind and "runs" — consecutive pieces of one text that carry different formatting.

Do what the instruction asks, generously:
- Broad instructions (tone, style, more persuasive, premium, friendlier, shorter) apply to ALL marketing copy — section titles, headlines, descriptions, buttons, guarantees, testimonials. Rewrite each of them noticeably; don't play it safe by returning them unchanged.
- Targeted instructions ("change the headline", "set the price to $49", "rename X to Y") change only their target; return the other fields unchanged.
- Keep lengths roughly similar unless the instruction asks for shorter or longer text.
- Language: keep the page's language — the language the instruction is typed in doesn't matter. Switch only when asked to translate or to write in a named language; then translate faithfully instead of rewording.
- Keep the offer, brand, product and person names unless the instruction says otherwise.

${COMMON_RULES}`;

const fieldLine = (f: Field) =>
  JSON.stringify({
    id: f.id,
    kind: f.kind,
    ...(f.role ? { role: f.role } : {}),
    ...(f.group ? { group: f.group } : {}),
    runs: f.runs.map((r) => r.replace(/\s+/g, " ")),
  });

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
  // A chunk whose answer comes back as malformed JSON is retried once; if it
  // still fails, only its fields count as failed — the rest of the page goes on.
  const askChunk = async (chunk: Field[], header: string) => {
    const run = () => generateObject({ model, schema, system: opts.system, prompt: buildPrompt(header, outline, chunk) });
    try {
      return (await run()).object;
    } catch {
      return (await run().catch(() => null))?.object ?? null;
    }
  };
  const ask = async (batch: Field[], header: string) => {
    const results = await Promise.all(chunkBySection(batch).map((chunk) => askChunk(chunk, header)));
    for (const object of results) for (const f of object?.fields ?? []) answers.set(f.id, f.runs);
  };

  const collect = async (header: string) => {
    answers.clear();
    await ask(fields, header);
    // Models sometimes drop fields from long lists or merge runs — one retry for those.
    const missing = fields.filter((f) => !isExact(f, answers.get(f.id)));
    if (missing.length) {
      const first = new Map(missing.map((f) => [f.id, answers.get(f.id)]));
      await ask(missing, header);
      // Keep the first answer if the retry came back worse (e.g. omitted).
      for (const f of missing) if (!hasText(answers.get(f.id)) && hasText(first.get(f.id))) answers.set(f.id, first.get(f.id)!);
    }
  };

  type Outcome = { field: Field; next?: string[]; before: string; after?: string; simplified?: boolean; status: "changed" | "unchanged" | "failed" };
  const evaluate = (): Outcome[] => fields.map((field) => {
    const before = plain(field);
    const answer = answers.get(field.id);
    if (!hasText(answer)) return { field, before, status: "failed" };
    const fitted = fitRuns(field, answer);
    const next = spaceRuns(field.runs, fitted.runs);
    const after = joinRuns(next, field.lineStarts);
    const same = before === after || changesNumbers(before, after, opts.request);
    return { field, next, before, after, simplified: fitted.simplified, status: same ? "unchanged" : "changed" };
  });

  await collect(opts.header);
  let outcomes = evaluate();
  // Cheaper models sometimes play safe and return every field untouched. If no
  // marketing copy (labels/legal excluded) changed at all, ask once more.
  const copyChanged = (list: Outcome[]) => list.some((o) => o.status === "changed" && !o.field.role);
  if (fields.some((f) => !f.role) && !copyChanged(outcomes)) {
    await collect(`${opts.header}\n\nNOTE: a previous attempt returned every field unchanged. Apply the request now — visibly rewrite the copy it concerns.`);
    const retry = evaluate();
    if (copyChanged(retry)) outcomes = retry;
  }

  const changes: RewriteChange[] = [];
  let unchanged = 0;
  let failed = 0;
  for (const o of outcomes) {
    if (o.status === "failed") { failed++; continue; }
    if (o.status === "unchanged") { unchanged++; continue; }
    o.field.write(o.next!);
    changes.push({ id: o.field.id, kind: o.simplified ? `${o.field.kind} · formatting simplified` : o.field.kind, before: o.before, after: o.after! });
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

// Edit text per an instruction — one section/element (scopeNodeId) or the whole
// page. Returns the new props of each changed node (applied in place by the
// editor) and the full updated page (for "new step" / "replace page").
export async function editPageCopy(opts: {
  workspaceId: string;
  pageJson: unknown;
  scopeNodeId?: string;
  instruction: string;
}): Promise<{ pageJson: any; updates: Record<string, any>; changes: RewriteChange[]; total: number; unchanged: number; failed: number }> {
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
  return { pageJson: r.clone, updates, changes: r.changes, total: r.fields.length, unchanged: r.unchanged, failed: r.failed };
}

// One free-text box serves both modes: decide whether the user described a
// (new) offer to write the page for, or asked to change the existing wording.
export async function classifyRequest(workspaceId: string, request: string): Promise<"rewrite" | "edit"> {
  const { object } = await generateObject({
    model: await modelFor(workspaceId),
    schema: z.object({ kind: z.enum(["new_offer", "edit"]) }),
    system:
      "Classify a request about a landing page's copy.\n" +
      "new_offer — it names a product, service, business, offer or audience the page should be about (a brief) — even when phrased as \"rewrite for X\" or \"make this page about X\". E.g. \"Online yoga course for busy professionals, 30% off, friendly tone\", \"Rewrite this for a pet grooming salon in Austin\".\n" +
      "edit — it only asks to change the existing wording while keeping the same offer: translate, change tone, shorten, fix grammar, make more persuasive, change a price or a single name.",
    prompt: request,
  });
  return object.kind === "new_offer" ? "rewrite" : "edit";
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
