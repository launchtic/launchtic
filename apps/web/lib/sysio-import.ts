// Import a PUBLISHED systeme.io page into our Craft.js pageJson.
//
// Strategy: we DON'T copy systeme's styling (their margins/paddings/font sizes/
// widths don't translate cleanly and produced ugly results). Instead we keep
// only their STRUCTURE (Section→Row→Column tree) + CONTENT (text HTML, image
// URLs, button labels/links, column grid sizes) and rebuild every element with
// OUR own default props (DEFAULT_STYLES). The result looks like a native
// launchtic page the operator can refine — not a broken pixel-copy.
//
// We keep a few high-signal bits that define the "look": section/row background
// color, text color (inside the HTML), column size, text alignment, and
// per-device visibility (appearance) — everything else is our defaults.

export type CraftNode = {
  type: { resolvedName: string };
  nodes: string[];
  props: Record<string, unknown>;
  custom: Record<string, unknown>;
  parent?: string;
  hidden: boolean;
  isCanvas: boolean;
  displayName: string;
  linkedNodes: Record<string, string>;
};

export type ImportResult = { name: string; pageJson: Record<string, CraftNode>; warnings: string[] };

type Entity = Record<string, any> & { id: string; type: string; childIds?: string[]; parentId?: string };

const ROOT_ID = "ROOT";

// ─── Our element defaults (subset of @launchtic/elements DEFAULT_STYLES) ─────
// Inlined so this server-side importer doesn't pull the React-heavy elements
// package. Keep in sync with packages/elements/src/elements/DefaultStyles.ts.
const APPEARANCE = { mobile: true, desktop: true };
const DEFAULTS: Record<string, Record<string, unknown>> = {
  section: {
    padding: { paddingTop: 40, paddingBottom: 40, paddingLeft: 40, paddingRight: 40 },
    mobilePadding: { paddingTop: 5, paddingBottom: 5, paddingLeft: 5, paddingRight: 5 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    contentWidth: "1120px",
    appearance: APPEARANCE,
  },
  row: {
    padding: { paddingTop: 10, paddingBottom: 10, paddingLeft: 10, paddingRight: 10 },
    mobilePadding: { paddingTop: 5, paddingBottom: 5, paddingLeft: 5, paddingRight: 5 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    disableStacking: false,
    reverseColumns: false,
    gap: 10,
    appearance: APPEARANCE,
  },
  text: {
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 15, marginBottom: 15, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 10, marginBottom: 10, marginLeft: 0, marginRight: 0 },
    textAlign: "left", fontSize: 20, mobileFontSize: 16, lineHeight: 24, mobileLineHeight: 21,
    fontType: "default", appearance: APPEARANCE,
  },
  headline: {
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 20, marginBottom: 20, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 10, marginBottom: 10, marginLeft: 0, marginRight: 0 },
    textAlign: "left", fontSize: 32, mobileFontSize: 24, lineHeight: 38, mobileLineHeight: 28,
    fontType: "default", appearance: APPEARANCE,
  },
  bulletedList: {
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 15, marginBottom: 15, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    iconColor: "rgba(0, 0, 0, 1)", iconSize: 20, textAlign: "left",
    fontSize: 20, mobileFontSize: 16, lineHeight: 34, mobileLineHeight: 24,
    fontType: "default", appearance: APPEARANCE,
  },
  image: {
    imageDetail: { url: undefined, action: "none", link: undefined, openNewTab: false, alt: "", width: undefined },
    padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    mobilePadding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
    margin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    alignSelf: "center", appearance: APPEARANCE,
  },
  button: {
    text: "Click here", subText: "",
    fontSize: 20, mobileFontSize: 20, lineHeight: 24, mobileLineHeight: 21,
    color: "rgba(255, 255, 255, 1)", backgroundColor: "rgb(25, 118, 210, 1)", subTextColor: "rgba(255, 255, 255, 0.8)",
    fontType: "default", width: "auto", mobileWidth: "full", alignSelf: "flex-start", textAlign: "center",
    boxShadow: "blurryShadow",
    padding: { paddingTop: 15, paddingBottom: 15, paddingLeft: 90, paddingRight: 90 },
    mobilePadding: { paddingTop: 10, paddingBottom: 10, paddingLeft: 20, paddingRight: 20 },
    margin: { marginTop: 15, marginBottom: 15, marginLeft: 0, marginRight: 0 },
    mobileMargin: { marginTop: 10, marginBottom: 10, marginLeft: 0, marginRight: 0 },
    action: "open_url", redirectionType: "sameWindow", linkUrl: "", nofollow: false, popup: "", doubleOptIn: false,
    appearance: APPEARANCE,
  },
};

// ─── Extract ─────────────────────────────────────────────────────────────────

export function extractPreloadedState(html: string): any {
  const marker = "window.__PRELOADED_STATE__";
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new Error("This page has no systeme.io page data. Use a published systeme.io page URL (e.g. https://…systeme.io/…).");
  }
  const braceStart = html.indexOf("{", start);
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = braceStart; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
  }
  if (end < 0) throw new Error("Could not parse the page state.");
  const json = html.slice(braceStart, end).replace(/\\x([0-9a-fA-F]{2})/g, "\\u00$1");
  return JSON.parse(json);
}

// ─── Content helpers ─────────────────────────────────────────────────────────

// Strip systeme's styling noise from text HTML but KEEP `color` (so light-on-
// dark text stays legible) — our element defaults drive size/spacing/font.
function sanitizeHtml(html: string): string {
  if (!html) return "";
  let s = html;
  s = s.replace(/\sstyle="([^"]*)"/gi, (_m, decls) => {
    const color = String(decls).split(";").map((d) => d.trim()).find((d) => /^color\s*:/i.test(d));
    return color ? ` style="${color}"` : "";
  });
  // systeme class / data / id hooks mean nothing to us.
  s = s.replace(/\s(?:class|id|data-[\w-]+)="[^"]*"/gi, "");
  return s.trim();
}

const rawHtml = (html: string) => JSON.stringify({ html: sanitizeHtml(html) });
const validAlign = (a: unknown): a is string => a === "left" || a === "center" || a === "right" || a === "justify";

function appearanceOf(e: Entity): Record<string, unknown> {
  return e.appearance && typeof e.appearance === "object" ? { appearance: e.appearance } : {};
}

// ─── Convert ─────────────────────────────────────────────────────────────────

function craft(resolvedName: string, props: Record<string, unknown>, opts: { nodes?: string[]; parent?: string; isCanvas?: boolean }): CraftNode {
  return {
    type: { resolvedName },
    nodes: opts.nodes ?? [],
    props,
    custom: {},
    ...(opts.parent ? { parent: opts.parent } : {}),
    hidden: false,
    isCanvas: !!opts.isCanvas,
    displayName: resolvedName,
    linkedNodes: {},
  };
}

function mapEntity(e: Entity, parent: string, ctx: { nextImg: () => string | undefined; warnings: string[] }): CraftNode | null {
  const children = e.childIds ?? [];
  const content = e.content ?? e.html ?? "";

  switch (e.type) {
    case "Section":
      return craft("Section", {
        ...DEFAULTS.section,
        ...(e.backgroundColor ? { backgroundColor: e.backgroundColor } : {}),
        ...appearanceOf(e),
      }, { nodes: children, parent, isCanvas: true });

    case "Row":
      return craft("Row", {
        ...DEFAULTS.row,
        ...(e.backgroundColor ? { backgroundColor: e.backgroundColor } : {}),
        ...appearanceOf(e),
      }, { nodes: children, parent, isCanvas: true });

    case "Column":
      return craft("Column", { size: Math.min(12, Math.max(1, Number(e.size) || 12)) }, { nodes: children, parent, isCanvas: true });

    case "Text":
      return craft("Text", { ...DEFAULTS.text, rawContentState: rawHtml(content), ...(validAlign(e.textAlign) ? { textAlign: e.textAlign } : {}), ...appearanceOf(e) }, { parent });

    case "Headline":
      return craft("Headline", { ...DEFAULTS.headline, rawContentState: rawHtml(content), ...(validAlign(e.textAlign) ? { textAlign: e.textAlign } : {}), ...appearanceOf(e) }, { parent });

    case "BulletList":
      return craft("BulletedList", { ...DEFAULTS.bulletedList, rawContentState: rawHtml(content), ...(validAlign(e.textAlign) ? { textAlign: e.textAlign } : {}), ...appearanceOf(e) }, { parent });

    case "Image": {
      const url = ctx.nextImg() ?? "";
      if (!url) ctx.warnings.push("An image had no resolvable URL — set it in the editor.");
      return craft("Image", {
        ...DEFAULTS.image,
        imageDetail: { ...(DEFAULTS.image.imageDetail as object), url, alt: "" },
        ...(e.alignSelf ? { alignSelf: e.alignSelf } : {}),
        ...appearanceOf(e),
      }, { parent });
    }

    case "BUTTON": {
      const opt = (e.options && typeof e.options === "object" && !Array.isArray(e.options)) ? e.options : {};
      const link = opt.url || opt.link || "";
      return craft("Button", {
        ...DEFAULTS.button,
        text: (opt.text && String(opt.text)) || "Button",
        subText: opt.subText ? String(opt.subText) : "",
        linkUrl: link,
        action: link ? "open_url" : (DEFAULTS.button.action as string),
        ...(opt.appearance ? { appearance: opt.appearance } : {}),
      }, { parent });
    }

    case "FORM_INPUT":
    case "Faq":
    case "FaqItem":
    case "Menu":
    case "HorizontalLine":
      ctx.warnings.push(`"${e.type}" isn't auto-imported yet — add it in the editor.`);
      return null;

    default:
      ctx.warnings.push(`Unsupported element "${e.type}" was skipped.`);
      return null;
  }
}

export function convertSystemeToPageJson(state: any, html?: string): ImportResult {
  const page = state?.page ?? state;
  const entities: Record<string, Entity> = page?.entities ?? {};
  const warnings: string[] = [];

  const imgUrls = html ? Array.from(html.matchAll(/<img[^>]+src="([^"]+)"/g), (m) => m[1]) : [];
  let imgCursor = 0;
  const ctx = { nextImg: () => imgUrls[imgCursor++], warnings };

  const root = Object.values(entities).find((e) => e.type === "Body") ?? Object.values(entities).find((e) => !e.parentId);
  if (!root) throw new Error("Couldn't find the page root in the systeme.io data.");

  const out: Record<string, CraftNode> = {
    [ROOT_ID]: craft("Page", { background: "rgba(255,255,255,1)" }, { nodes: (root.childIds ?? []).slice(), isCanvas: true }),
  };

  const queue: Array<{ id: string; parent: string }> = (root.childIds ?? []).map((id) => ({ id, parent: ROOT_ID }));
  while (queue.length) {
    const { id, parent } = queue.shift()!;
    const e = entities[id];
    if (!e) continue;
    const node = mapEntity(e, parent, ctx);
    if (!node) continue;
    out[id] = node;
    for (const childId of e.childIds ?? []) queue.push({ id: childId, parent: id });
  }

  // Drop references to skipped/missing children so the tree stays consistent.
  for (const n of Object.values(out)) n.nodes = n.nodes.filter((cid) => out[cid]);

  const name = (page?.seo?.title && String(page.seo.title).trim()) || `Imported systeme.io page ${page?.id ?? ""}`.trim();
  return { name, pageJson: out, warnings };
}

// ─── Fetch + import (one shot) ───────────────────────────────────────────────

export async function importSystemeUrl(url: string): Promise<ImportResult> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Enter a valid URL."); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("URL must be http(s).");
  if (!/(^|\.)systeme\.io$/i.test(parsed.hostname)) {
    throw new Error("Only systeme.io page URLs are supported (e.g. https://…systeme.io/…).");
  }

  const res = await fetch(parsed.toString(), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LaunchticImporter/1.0)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Could not fetch the page (HTTP ${res.status}).`);
  const html = await res.text();
  const state = extractPreloadedState(html);
  return convertSystemeToPageJson(state, html);
}
