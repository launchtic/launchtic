// Describe a page template from its own content, so the AI can pick templates
// without hand-written tags or descriptions. Walks the Craft.js tree from ROOT
// in page order and collects the first headlines, the section count, notable
// elements, and — for landing pages — whether it collects leads or sells.

type CraftNode = {
  type?: { resolvedName?: string } | string;
  props?: Record<string, unknown>;
  nodes?: string[];
  linkedNodes?: Record<string, string>;
};

export type TemplatePurpose = "lead capture" | "sales";

export type TemplateSummary = {
  headings: string[];   // first few headline texts, in page order
  sections: number;
  features: string[];   // e.g. "form (3 fields)", "countdown", "faq"
  purpose: TemplatePurpose | null; // landing pages only
};

const MAX_HEADINGS = 2;
const MAX_HEADING_CHARS = 60;

function nodeName(n: CraftNode): string {
  return typeof n.type === "string" ? n.type : n.type?.resolvedName ?? "";
}

// Headline/Text keep their copy as a JSON string: { html } (or Draft.js blocks).
function textOf(n: CraftNode): string {
  const raw = n.props?.rawContentState;
  if (typeof raw !== "string") return "";
  let html = "";
  try {
    const parsed = JSON.parse(raw);
    html = typeof parsed?.html === "string"
      ? parsed.html
      : Array.isArray(parsed?.blocks) ? parsed.blocks.map((b: { text?: string }) => b.text ?? "").join(" ") : "";
  } catch {
    return "";
  }
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function clip(s: string): string {
  return s.length > MAX_HEADING_CHARS ? s.slice(0, MAX_HEADING_CHARS - 1).trimEnd() + "…" : s;
}

export function summarizeTemplate(pageJson: unknown, stepType?: string): TemplateSummary {
  const tree = (pageJson && typeof pageJson === "object" ? pageJson : {}) as Record<string, CraftNode>;
  const counts: Record<string, number> = {};
  const headings: string[] = [];
  const seen = new Set<string>();

  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = tree[id];
    if (!n) return;
    const name = nodeName(n);
    counts[name] = (counts[name] ?? 0) + 1;
    if (name === "Headline" && headings.length < MAX_HEADINGS) {
      const t = textOf(n);
      // Skip step numbers / prices ("1", "$149") — they say nothing about the page.
      if (/[a-z]{3}/i.test(t)) headings.push(clip(t));
    }
    for (const child of n.nodes ?? []) visit(child);
    for (const child of Object.values(n.linkedNodes ?? {})) visit(child);
  };
  visit("ROOT");

  const features: string[] = [];
  if (counts.Field) features.push(`form (${counts.Field} field${counts.Field > 1 ? "s" : ""})`);
  if (counts.OfferPrice || counts.PaymentButton) features.push("price / buy button");
  if (counts.Countdown) features.push("countdown");
  if (counts.FAQ) features.push("faq");
  if (counts.Video) features.push("video");

  return {
    headings,
    sections: counts.Section ?? 0,
    features,
    // A landing page with form fields collects leads; otherwise it sells.
    purpose: stepType === "LANDING" ? (counts.Field ? "lead capture" : "sales") : null,
  };
}

// One compact line for the AI, e.g.
// "sales · 9 sections · faq · “Savor Small-Batch Beans…” / “Sip Your Way…”"
export function summaryLine(s: TemplateSummary): string {
  const parts: string[] = [];
  if (s.purpose) parts.push(s.purpose);
  parts.push(`${s.sections} sections`);
  if (s.features.length) parts.push(s.features.join(", "));
  if (s.headings.length) parts.push(s.headings.map((h) => `“${h}”`).join(" / "));
  return parts.join(" · ");
}
