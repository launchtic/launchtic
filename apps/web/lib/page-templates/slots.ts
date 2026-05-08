// Slot syntax in saved-block / template content: {{slot_name}}.
// We support simple identifiers (a-z, A-Z, 0-9, _) up to 60 chars.
// Slots can appear in:
//   - Text / Headline / BulletedList rawContentState (JSON-stringified { html })
//   - Button text / subText
//   - Image imageDetail.alt
//   - any string prop named 'linkUrl', etc. (kept simple for v1)

const SLOT_REGEX = /\{\{(\w{1,60})\}\}/g;

const STRING_PROP_KEYS = ["text", "subText", "linkUrl", "alt"] as const;

function extractFromString(value: unknown, into: Set<string>) {
  if (typeof value !== "string") return;
  for (const m of value.matchAll(SLOT_REGEX)) into.add(m[1]);
}

function extractFromRawContentState(raw: unknown, into: Set<string>) {
  if (typeof raw !== "string" || !raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.html === "string") {
      extractFromString(parsed.html, into);
    }
  } catch {
    // not valid JSON — fall back to raw scan
    extractFromString(raw, into);
  }
}

function walkProps(props: any, into: Set<string>) {
  if (!props || typeof props !== "object") return;

  // Direct top-level string slots
  for (const key of STRING_PROP_KEYS) {
    extractFromString(props[key], into);
  }

  // Rich text content (Text / Headline / BulletedList)
  extractFromRawContentState(props.rawContentState, into);

  // Image detail nested object
  if (props.imageDetail && typeof props.imageDetail === "object") {
    extractFromString(props.imageDetail.alt, into);
    extractFromString(props.imageDetail.link, into);
  }

  // FAQ items array — questionHtml/answerHtml (rich HTML) can contain {{slots}}.
  if (Array.isArray(props.items)) {
    for (const item of props.items) {
      if (!item || typeof item !== "object") continue;
      extractFromString(item.questionHtml, into);
      extractFromString(item.answerHtml, into);
      // Menu items: { text, link }
      extractFromString(item.text, into);
      extractFromString(item.link, into);
    }
  }
}

/**
 * contentJson stored on SavedBlock has shape:
 *   { rootNodeId: string, nodes: { [id]: SerializedNode } }
 * where SerializedNode has flat props (no `data` wrapper).
 */
export function extractSlots(contentJson: any): string[] {
  const slots = new Set<string>();
  if (!contentJson?.nodes || typeof contentJson.nodes !== "object") return [];
  for (const node of Object.values(contentJson.nodes) as any[]) {
    walkProps(node?.props, slots);
  }
  return Array.from(slots);
}

/**
 * Same extractor, but accepts the assembled PageTemplate pageJson shape
 * (flat map: { ROOT: SerializedNode, [id]: SerializedNode }).
 */
export function extractSlotsFromPageJson(pageJson: any): string[] {
  const slots = new Set<string>();
  if (!pageJson || typeof pageJson !== "object") return [];
  for (const node of Object.values(pageJson) as any[]) {
    walkProps(node?.props, slots);
  }
  return Array.from(slots);
}
