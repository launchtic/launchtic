// Browser-safe helpers: {{var}} substitution + email-doc constants/validation.
// NO mjml here (that lives in render-email.ts, server-only).
//   render("Hi {{contact.firstName}}", { contact: { firstName: "John" } }) → "Hi John"

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

export function sampleVars(): RenderVars {
  return {
    contact: { firstName: "John", lastName: "Doe", email: "john@example.com", fullName: "John Doe" },
    workspace: { name: "Your Workspace" },
    order: { id: "ord_demo123", total: "$99.00", currency: "USD" },
    unsubscribeUrl: "#preview-unsubscribe",
  };
}

// Craft serialized docs — Page → Section → Column → content. Default seed.
import { DEFAULT_EMAIL_FONT } from "./fonts";
const PAGE_PROPS = { width: 600, breakpoint: 480, bgColor: "#f3f4f6", fontFamily: DEFAULT_EMAIL_FONT };
const node = (resolvedName: string, props: any, parent: string | undefined, nodes: string[] = [], isCanvas = false) =>
  ({ type: { resolvedName }, isCanvas, props, displayName: resolvedName, custom: {}, hidden: false, ...(parent ? { parent } : {}), nodes, linkedNodes: {} });

export const EMPTY_EMAIL_DOC = JSON.stringify({
  ROOT: node("Page", PAGE_PROPS, undefined, ["s1"], true),
  s1: node("Section", { bgColor: "#ffffff", paddingY: 10, paddingX: 10 }, "ROOT", ["c1"], true),
  c1: node("Column", { bgColor: "transparent", paddingY: 0, paddingX: 8, verticalAlign: "middle" }, "s1", [], true),
});

export const WELCOME_EMAIL_DOC = JSON.stringify({
  ROOT: node("Page", PAGE_PROPS, undefined, ["s1"], true),
  s1: node("Section", { bgColor: "#ffffff", paddingY: 10, paddingX: 10 }, "ROOT", ["c1"], true),
  c1: node("Column", { bgColor: "transparent", paddingY: 0, paddingX: 8, verticalAlign: "middle" }, "s1", ["h1", "t1"], true),
  h1: node("EmailHeading", { text: "Welcome, {{contact.firstName}}", fontSize: 24, color: "#111827", align: "left" }, "c1"),
  t1: node("EmailText", { text: "Thanks for joining {{workspace.name}}. We're glad to have you.", fontSize: 14, color: "#374151", align: "left" }, "c1"),
});

// True if a stored email body has no visible content (handles both formats).
export function isEmptyEmailDoc(content: string | null | undefined): boolean {
  const trimmed = (content ?? "").trim();
  if (!trimmed || !trimmed.startsWith("{")) return true;
  try {
    const json = JSON.parse(trimmed);
    if (json?.ROOT) {
      // craft — empty unless at least one content block exists anywhere
      const CONTENT = ["EmailHeading", "EmailText", "EmailButton", "EmailImage", "EmailDivider", "EmailSpacer"];
      return !Object.values(json as Record<string, any>).some((n) => {
        const rn = typeof n?.type === "string" ? n.type : n?.type?.resolvedName;
        return CONTENT.includes(rn);
      });
    }
    return !hasVisibleContent(json);                                    // legacy maily
  } catch {
    return true;
  }
}

function hasVisibleContent(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (typeof n.text === "string" && n.text.trim().length > 0) return true;
  if (n.type && n.type !== "doc" && n.type !== "paragraph" && n.type !== "text") return true;
  if (Array.isArray(n.content)) return n.content.some(hasVisibleContent);
  return false;
}
