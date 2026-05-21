// Generate sample placeholder values for template slots when AI fill isn't
// available — either the user opted out, didn't provide a brief, or their
// role lacks `ai:use` permission. The goal is to give them a page they can
// preview and edit instead of literal `{{slot_name}}` text everywhere.
//
// Resolution rule per slot:
//   1. Match name against a curated heuristic table (headline/cta/price/…)
//   2. Fall back to humanizing the slot name itself (e.g. product_name → "Product Name")
//
// This is intentionally simple — operators edit copy in the page editor
// after applying; samples just have to look like real content, not be it.

const HEADLINE_DEFAULT       = "Your Headline Goes Here";
const SUBHEADLINE_DEFAULT    = "A short, compelling tagline that explains the offer.";
const CTA_DEFAULT            = "Get Started";
const DESCRIPTION_DEFAULT    = "Add your description here. Tell visitors what makes this offer worth their time.";
const PRICE_DEFAULT          = "$0";
const NAME_DEFAULT           = "Your Name";
const EMAIL_DEFAULT          = "you@example.com";
const PHONE_DEFAULT          = "+1 (555) 000-0000";
const QUOTE_DEFAULT          = "“This product changed how I work — highly recommended.”";
const AUTHOR_DEFAULT         = "Sample Customer";
const FEATURE_DEFAULT        = "A key feature or benefit of the offer";
const FAQ_QUESTION_DEFAULT   = "Frequently asked question?";
const FAQ_ANSWER_DEFAULT     = "A clear, reassuring answer that resolves the concern.";
const LABEL_DEFAULT          = "Label";
const URL_DEFAULT            = "#";
const ALT_DEFAULT            = "Image description";
const COMPANY_DEFAULT        = "Your Company";
const DATE_DEFAULT           = "Coming soon";

/**
 * Look up sample copy for a single slot name. Lowercased substring matches
 * keep the table short — `hero_headline_1` and `headline` both hit the
 * headline branch.
 */
function sampleValueForSlot(name: string): string {
  const n = name.toLowerCase();

  // Order matters: longer/more specific keys checked before shorter ones
  if (n.includes("subheadline") || n.includes("subtitle") || n.includes("tagline") || n.includes("subhead")) return SUBHEADLINE_DEFAULT;
  if (n.includes("headline") || n === "title" || n.endsWith("_title") || n.includes("heading"))             return HEADLINE_DEFAULT;
  if (n.includes("cta") || n.includes("button") || n.endsWith("_btn") || n.endsWith("_text"))               return CTA_DEFAULT;
  if (n.includes("description") || n.includes("body") || n.includes("content") || n.includes("paragraph") || n === "desc") return DESCRIPTION_DEFAULT;

  if (n.includes("price") || n.includes("amount") || n.includes("cost"))           return PRICE_DEFAULT;
  if (n.includes("email"))                                                          return EMAIL_DEFAULT;
  if (n.includes("phone") || n.includes("tel"))                                     return PHONE_DEFAULT;
  if (n.includes("company") || n.includes("brand") || n.includes("business"))      return COMPANY_DEFAULT;

  if (n.includes("quote") || n.includes("testimonial_text") || n === "testimonial") return QUOTE_DEFAULT;
  if (n.includes("author") || n.includes("reviewer") || n.includes("witness"))      return AUTHOR_DEFAULT;
  if (n.includes("feature") || n.includes("benefit") || n.includes("bullet"))       return FEATURE_DEFAULT;

  if (n.includes("question") || n === "q" || n.startsWith("q_"))   return FAQ_QUESTION_DEFAULT;
  if (n.includes("answer")   || n === "a" || n.startsWith("a_"))   return FAQ_ANSWER_DEFAULT;

  if (n === "name" || n.endsWith("_name") || n.includes("fullname")) return NAME_DEFAULT;
  if (n.includes("date") || n.includes("deadline") || n.includes("when")) return DATE_DEFAULT;

  if (n.endsWith("url") || n.endsWith("link") || n.endsWith("href")) return URL_DEFAULT;
  if (n === "alt" || n.endsWith("_alt") || n.includes("image_alt"))  return ALT_DEFAULT;
  if (n === "label" || n.endsWith("_label"))                          return LABEL_DEFAULT;

  // Fallback: humanize the slot name itself (snake_case / kebab-case → Title Case).
  return humanize(name);
}

function humanize(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Sample text";
}

/**
 * Build a values map for every slot in the list. Pass the result into
 * `fillSlotsInPageJson(pageJson, values)` to substitute every placeholder
 * with a sensible default.
 */
export function generateSampleSlotValues(slots: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const slot of slots) {
    values[slot] = sampleValueForSlot(slot);
  }
  return values;
}
