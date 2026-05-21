// Replace `{{slot_name}}` placeholders in an assembled pageJson with
// concrete string values produced by the AI fill step. Mirror of the
// extractor in slots.ts — same prop locations, same regex.

const SLOT_REGEX = /\{\{(\w{1,60})\}\}/g;

// Keep in sync with slots.ts extractor — `alt` was missing here, so slots
// extracted from top-level `props.alt` would never be filled (they'd stay
// as literal `{{slot}}`). Affected both AI fill and sample fill.
const STRING_PROP_KEYS = ["text", "subText", "linkUrl", "alt"] as const;

function replaceInString(str: unknown, values: Record<string, string>): string | unknown {
  if (typeof str !== "string") return str;
  return str.replace(SLOT_REGEX, (_, name) => values[name] ?? `{{${name}}}`);
}

function replaceInRawContentState(raw: unknown, values: Record<string, string>): string | unknown {
  if (typeof raw !== "string" || !raw) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.html === "string") {
      parsed.html = (parsed.html as string).replace(SLOT_REGEX, (_, name) => values[name] ?? `{{${name}}}`);
    }
    return JSON.stringify(parsed);
  } catch {
    return (raw as string).replace(SLOT_REGEX, (_, name) => values[name] ?? `{{${name}}}`);
  }
}

/**
 * Walk the assembled pageJson tree and substitute slot values into every
 * place where extractSlotsFromPageJson() looks for them. Missing slot
 * values pass through as `{{name}}` (so the user can fix manually after).
 */
export function fillSlotsInPageJson(pageJson: any, values: Record<string, string>): any {
  if (!pageJson || typeof pageJson !== "object") return pageJson;

  const next: Record<string, any> = {};
  for (const [id, node] of Object.entries(pageJson) as [string, any][]) {
    if (!node?.props) {
      next[id] = node;
      continue;
    }

    const props = { ...node.props };

    for (const key of STRING_PROP_KEYS) {
      if (typeof props[key] === "string") {
        props[key] = replaceInString(props[key], values);
      }
    }

    if (typeof props.rawContentState === "string") {
      props.rawContentState = replaceInRawContentState(props.rawContentState, values);
    }

    if (props.imageDetail && typeof props.imageDetail === "object") {
      const im = { ...props.imageDetail };
      if (typeof im.alt === "string") im.alt = replaceInString(im.alt, values);
      if (typeof im.link === "string") im.link = replaceInString(im.link, values);
      props.imageDetail = im;
    }

    // FAQ / Menu items array — fill questionHtml/answerHtml/text/link
    if (Array.isArray(props.items)) {
      props.items = props.items.map((item: any) => {
        if (!item || typeof item !== "object") return item;
        const next: any = { ...item };
        if (typeof item.questionHtml === "string") next.questionHtml = replaceInString(item.questionHtml, values);
        if (typeof item.answerHtml === "string")   next.answerHtml   = replaceInString(item.answerHtml, values);
        if (typeof item.text === "string")         next.text         = replaceInString(item.text, values);
        if (typeof item.link === "string")         next.link         = replaceInString(item.link, values);
        return next;
      });
    }

    next[id] = { ...node, props };
  }

  return next;
}
