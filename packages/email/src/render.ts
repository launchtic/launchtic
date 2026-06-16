// Simple {{var}} template engine with dot-notation support.
//   render("Hi {{contact.firstName}}", { contact: { firstName: "John" } })
//     → "Hi John"
// Missing values render as empty string. No conditionals, no loops — by design.

export type RenderVars = Record<string, unknown>;

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function render(template: string, vars: RenderVars): string {
  return template.replace(TOKEN_RE, (_, path: string) => {
    const value = path.split(".").reduce<unknown>(
      (acc, key) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      vars,
    );
    return value == null ? "" : String(value);
  });
}

// List of variables exposed to all templates — used in UI variable picker
export const STANDARD_VARIABLES = [
  { key: "contact.firstName",  label: "Contact first name",  example: "John" },
  { key: "contact.lastName",   label: "Contact last name",   example: "Doe" },
  { key: "contact.email",      label: "Contact email",       example: "john@example.com" },
  { key: "contact.fullName",   label: "Contact full name",   example: "John Doe" },
  { key: "workspace.name",     label: "Workspace name",      example: "Acme Inc." },
  { key: "order.id",           label: "Order ID",            example: "ord_xxx" },
  { key: "order.total",        label: "Order total",         example: "$99.00" },
  { key: "order.currency",     label: "Order currency",      example: "USD" },
  { key: "unsubscribeUrl",     label: "Unsubscribe link",    example: "https://example.com/unsubscribe?t=..." },
] as const;

// Sample data for preview — matches STANDARD_VARIABLES
export function sampleVars(): RenderVars {
  return {
    contact: {
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      fullName: "John Doe",
    },
    workspace: { name: "Your Workspace" },
    order: { id: "ord_demo123", total: "$99.00", currency: "USD" },
    unsubscribeUrl: "#preview-unsubscribe",
  };
}

// Empty maily TipTap doc — used as default seed for new email content.
export const EMPTY_EMAIL_DOC = '{"type":"doc","content":[{"type":"paragraph"}]}';

// Default welcome-style content for newly-created sequences/broadcasts/
// automation email actions. Saves the user from staring at a blank canvas
// and keeps the body non-empty so validation doesn't bark on first save.
export const WELCOME_EMAIL_DOC = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2, textAlign: "left" },
      content: [{ type: "text", text: "Welcome, {{contact.firstName}}" }],
    },
    {
      type: "paragraph",
      attrs: { textAlign: "left" },
      content: [{ type: "text", text: "Thanks for joining {{workspace.name}}. We're glad to have you." }],
    },
    {
      type: "paragraph",
      attrs: { textAlign: "left" },
      content: [{ type: "text", text: "Replace this with your own message — or delete it and start fresh." }],
    },
  ],
});

// Returns true if a stored email body has no visible content.
// Used by validation (UI + API) to flag empty bodies. Walks the maily doc
// looking for any text with non-whitespace, or any non-paragraph block
// (image, button, divider, columns, etc.).
export function isEmptyEmailDoc(content: string | null | undefined): boolean {
  const trimmed = (content ?? "").trim();
  if (!trimmed || !trimmed.startsWith("{")) return true;
  try {
    const json = JSON.parse(trimmed);
    return !hasVisibleContent(json);
  } catch {
    return true;
  }
}

function hasVisibleContent(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (typeof n.text === "string" && n.text.trim().length > 0) return true;
  if (n.type && n.type !== "doc" && n.type !== "paragraph" && n.type !== "text") {
    return true;
  }
  if (Array.isArray(n.content)) {
    return n.content.some(hasVisibleContent);
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────
// Email content renderer — JSON-only.
// ─────────────────────────────────────────────────────────────────
//
// `content` MUST be a JSON-stringified TipTap doc (maily.to format).
// Maily renders to fully inline-styled, email-safe HTML on its own; we no
// longer wrap a shell or run juice. Operators add their own footer +
// unsubscribe link inside the editor (`{{unsubscribeUrl}}` token available).
//
// Variable substitution runs after maily render so `{{...}}` tokens inside
// any block resolve consistently.

// Override maily's default Inter font with classic web-safe Arial/Helvetica.
// Why: most email clients (Outlook desktop especially) strip @font-face, so
// loading Inter as a webfont gives inconsistent recipient experience —
// Apple Mail/Gmail web see Inter, Outlook sees Calibri fallback. By using
// system-installed fonts, every recipient renders the same way. Mirrors the
// font choice used in globals.css (editor) and preview-render.ts (in-app
// preview iframe) — three render paths, one font stack.
const EMAIL_THEME = {
  font: {
    fontFamily: "Arial",
    fallbackFontFamily: "Helvetica, sans-serif",
  },
};

// Curated web-safe fonts the customer can pick PER email (template / broadcast /
// workflow email). Web-safe only: Outlook desktop + Gmail strip @font-face, so
// these render the same for every recipient. Stored on each email row as the
// `name`; resolved to a theme (send) or CSS stack (editor/preview) at render.
export const EMAIL_FONTS = [
  // Sans-serif
  { name: "Arial",           fontFamily: "Arial",                fallback: "Helvetica, sans-serif" },
  { name: "Helvetica",       fontFamily: "Helvetica",            fallback: "Arial, sans-serif" },
  { name: "Verdana",         fontFamily: "Verdana",              fallback: "Geneva, sans-serif" },
  { name: "Tahoma",          fontFamily: "Tahoma",               fallback: "Verdana, sans-serif" },
  { name: "Trebuchet MS",    fontFamily: "Trebuchet MS",         fallback: "Helvetica, sans-serif" },
  { name: "Lucida Sans",     fontFamily: "Lucida Sans Unicode",  fallback: "'Lucida Grande', Geneva, Verdana, sans-serif" },
  // Serif
  { name: "Georgia",         fontFamily: "Georgia",              fallback: "'Times New Roman', serif" },
  { name: "Times New Roman", fontFamily: "Times New Roman",      fallback: "Times, serif" },
  { name: "Palatino",        fontFamily: "Palatino Linotype",    fallback: "Palatino, 'Book Antiqua', serif" },
  { name: "Garamond",        fontFamily: "Garamond",             fallback: "Baskerville, 'Times New Roman', serif" },
  // Monospace
  { name: "Courier New",     fontFamily: "Courier New",          fallback: "Courier, monospace" },
] as const;

export const DEFAULT_EMAIL_FONT = "Arial";

function resolveFont(font?: string | null) {
  return EMAIL_FONTS.find((f) => f.name === font) ?? EMAIL_FONTS[0];
}

// maily theme `font` block for the send-render path. webFont:null is REQUIRED:
// maily's default theme ships an Inter @font-face and deep-merges it in, which
// would alias the chosen family to Inter (so every font renders as Inter in
// webfont-capable clients). Nulling it keeps us on real web-safe system fonts.
export function emailFontTheme(font?: string | null) {
  const f = resolveFont(font);
  return { fontFamily: f.fontFamily, fallbackFontFamily: f.fallback, webFont: null };
}

// Full CSS font-family stack for the editor + preview (multi-word names quoted).
export function emailFontCss(font?: string | null): string {
  const f = resolveFont(font);
  const primary = f.fontFamily.includes(" ") ? `'${f.fontFamily}'` : f.fontFamily;
  return `${primary}, ${f.fallback}`;
}

export type RenderOptions = {
  // Append the standard unsubscribe footer if the doc doesn't already include
  // one. Pass true for marketing emails (broadcasts, sequences, automation
  // SEND_EMAIL actions) — required by CAN-SPAM (US), CASL (Canada), GDPR (EU),
  // VN PDPA. Default false for transactional / system emails.
  //
  // Detection is "lenient": if any node in the doc already references
  // {{unsubscribeUrl}}, we skip the append. Lets operators write their own
  // custom footer with the unsubscribe link inside it.
  appendUnsubscribe?: boolean;
  // Custom unsubscribe text. Use the literal token "{unsubscribe}" to mark
  // where the clickable link goes (single curly braces — distinguishes from
  // {{templateVars}}). If omitted, default English text is used.
  // Examples:
  //   "Tired of these? Just {unsubscribe} — no hard feelings."
  unsubscribeText?: string | null;
  // Workspace physical mailing address (CAN-SPAM §5(a)(5)). Rendered as a
  // small centered footer block above the unsubscribe line.
  physicalAddress?: string | null;
  // Per-email web-safe font name (see EMAIL_FONTS). Null/unknown → Arial.
  font?: string | null;
};

const DEFAULT_UNSUB_TEXT = "Don't want these emails? You can {unsubscribe} anytime.";

// Match the FIRST single-brace token in the template — captures its inner
// text (used as the visible link label). Single brace `{...}` distinguishes
// from `{{templateVar}}` which is double-brace. The negated char class
// `[^{}]+` prevents matching across nested braces.
const UNSUB_TOKEN_RE = /\{([^{}]+)\}/;

// Build the unsubscribe footer block from a template string. The first
// `{...}` token becomes the clickable link; the text inside the braces is
// used as the visible link label — so multi-language works:
//   "Don't want these? {unsubscribe} anytime."         → "unsubscribe" link
//   "Không muốn nhận email? {hủy đăng ký} bất cứ lúc nào." → "hủy đăng ký" link
function buildUnsubscribeFooterNode(template: string) {
  const trimmed = (template ?? "").trim();
  const match = trimmed.match(UNSUB_TOKEN_RE);
  const fallback = !match;
  const safe = fallback ? DEFAULT_UNSUB_TEXT : trimmed;
  const safeMatch = safe.match(UNSUB_TOKEN_RE)!;
  const linkLabel = safeMatch[1];
  const idx = safeMatch.index!;
  const before = safe.slice(0, idx);
  const after = safe.slice(idx + safeMatch[0].length);

  const linkMarks = [
    { type: "link", attrs: {
        href: "{{unsubscribeUrl}}", target: "_blank",
        rel: "noopener noreferrer nofollow",
        class: "mly:no-underline", isUrlVariable: false,
      },
    },
    { type: "textStyle", attrs: { color: "rgb(31, 31, 31)" } },
    { type: "bold" },
    { type: "underline" },
  ];

  const content: any[] = [];
  if (before) content.push({ type: "text", text: before });
  content.push({ type: "text", marks: linkMarks, text: linkLabel });
  if (after) content.push({ type: "text", text: after });

  return {
    type: "footer",
    attrs: { textAlign: "center", textDirection: "ltr", showIfKey: null },
    content,
  };
}

function docContainsUnsubscribe(doc: any): boolean {
  const stack = [doc];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (typeof node.text === "string" && node.text.includes("{{unsubscribeUrl}}")) return true;
    if (node.attrs?.href === "{{unsubscribeUrl}}") return true;
    if (Array.isArray(node.content)) for (const c of node.content) stack.push(c);
    if (Array.isArray(node.marks)) for (const m of node.marks) stack.push(m);
  }
  return false;
}

export async function renderEmailContent(
  content: string,
  vars: RenderVars,
  opts: RenderOptions = {},
): Promise<string> {
  const trimmed = (content ?? "").trim();
  if (!trimmed.startsWith("{")) {
    throw new Error("Email body must be a maily JSON doc");
  }
  const json = JSON.parse(trimmed);
  if (!json || typeof json !== "object" || json.type !== "doc") {
    throw new Error("Email body must be a maily JSON doc");
  }

  // Append workspace footer + unsubscribe BEFORE maily renders, so the
  // resulting block uses the same theme/typography as operator content.
  // horizontalRule = visible divider between operator content and footer.
  if (opts.appendUnsubscribe && !docContainsUnsubscribe(json)) {
    if (!Array.isArray(json.content)) json.content = [];

    json.content.push({ type: "horizontalRule" });

    if (opts.physicalAddress?.trim()) {
      json.content.push({
        type: "footer",
        attrs: { textAlign: "center", textDirection: "ltr", showIfKey: null },
        content: [{ type: "text", text: opts.physicalAddress.trim() }],
      });
    }

    json.content.push(buildUnsubscribeFooterNode(opts.unsubscribeText?.trim() || DEFAULT_UNSUB_TEXT));
  }

  // Dynamic import — keeps @maily-to/render out of the import graph
  // for callers that never use it.
  const { render: mailyRender } = await import("@maily-to/render");
  const theme = { ...EMAIL_THEME, font: emailFontTheme(opts.font) };
  const html = await mailyRender(json, { theme });
  return render(html, vars);
}
