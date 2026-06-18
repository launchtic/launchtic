// Serialize a Craft.js email tree (Page → Section → Column → content) into MJML.
// MJML compiles to bulletproof responsive HTML. Pure string logic (no mjml dep).

import { emailFontCss } from "./fonts";

type SNode = {
  type: { resolvedName?: string } | string;
  props?: Record<string, any>;
  nodes?: string[];
  linkedNodes?: Record<string, string>;
};
type SNodes = Record<string, SNode>;

const nameOf = (n: SNode) => (typeof n.type === "string" ? n.type : n.type?.resolvedName ?? "");
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s: unknown) => esc(s).replace(/"/g, "&quot;");
const ml = (s: unknown) => esc(s).replace(/\n/g, "<br/>");

// Outer spacing (margin) → MJML's `padding` attr (the standard per-block spacing
// within a column). defY = legacy default when marginY is absent.
const mPad = (p: Record<string, any>, defY = 8) => `${Number(p.marginY ?? defY)}px ${Number(p.marginX ?? 0)}px`;
// Inner padding for rich-text blocks — wrap content in a padded div only when set
// (keeps the common no-padding case as raw passthrough).
const padWrap = (p: Record<string, any>, html: string) =>
  (Number(p.paddingY) || Number(p.paddingX)) ? `<div style="padding:${Number(p.paddingY) || 0}px ${Number(p.paddingX) || 0}px">${html}</div>` : html;

export function isCraftDoc(serialized: string): boolean {
  try { const o = JSON.parse(serialized); return !!o && typeof o === "object" && !!o.ROOT; } catch { return false; }
}

function block(n: SNode): string {
  const p = n.props ?? {};
  switch (nameOf(n)) {
    case "EmailHeading": {
      // text is rich HTML from the inline editor — emit as-is (wrap for inner padding).
      const inner = padWrap(p, p.text || "Heading");
      return `<mj-text font-size="${Number(p.fontSize) || 24}px" font-weight="bold" color="${attr(p.color || "#111827")}" align="${attr(p.align || "left")}" line-height="${p.lineHeight ?? 1.3}" letter-spacing="${Number(p.letterSpacing) || 0}px" padding="${mPad(p)}">${inner}</mj-text>`;
    }
    case "EmailText": {
      const inner = padWrap(p, p.text || "");
      return `<mj-text font-size="${Number(p.fontSize) || 14}px" color="${attr(p.color || "#374151")}" align="${attr(p.align || "left")}" line-height="${p.lineHeight ?? 1.6}" letter-spacing="${Number(p.letterSpacing) || 0}px" padding="${mPad(p)}">${inner}</mj-text>`;
    }
    case "EmailButton":
      return `<mj-button background-color="${attr(p.bg || "#2563eb")}" color="${attr(p.color || "#ffffff")}" href="${attr(p.href || "#")}" border-radius="${Number(p.radius) || 0}px" font-size="${Number(p.fontSize) || 14}px" font-weight="${attr(p.fontWeight ?? 600)}" align="${attr(p.align || "center")}" padding="${mPad(p, 12)}" inner-padding="${Number(p.paddingY ?? 12)}px ${Number(p.paddingX ?? 28)}px">${esc(p.text || "Button")}</mj-button>`;
    case "EmailImage":
      if (!p.src) return "";
      return `<mj-image src="${attr(p.src)}" alt="${attr(p.alt || "")}" align="${attr(p.align || "center")}"${p.width ? ` width="${Number(p.width)}px"` : ""}${p.href ? ` href="${attr(p.href)}"` : ""} padding="${mPad(p)}" />`;
    case "EmailDivider":
      return `<mj-divider border-color="${attr(p.color || "#e5e7eb")}" border-width="${Number(p.thickness) || 1}px" border-style="${attr(p.style || "solid")}" padding="${Number(p.paddingY) || 8}px 0" />`;
    case "EmailSpacer":
      return `<mj-spacer height="${Number(p.height) || 16}px"${p.bgColor && p.bgColor !== "transparent" ? ` container-background-color="${attr(p.bgColor)}"` : ""} />`;
    case "EmailNavbar": {
      const items: { text: string; href: string }[] = Array.isArray(p.items) ? p.items : [];
      const gap = Number(p.itemGap ?? p.itemPaddingX ?? p.itemPadding ?? 16); // back-compat
      const deco = p.underline ? "underline" : "none";
      const fw = p.bold ? 700 : 400;
      const fs = p.italic ? "italic" : "normal";
      const links = items.map((it, i) =>
        `<a href="${attr(it.href || "#")}" style="display:inline-block;text-decoration:${deco};font-weight:${fw};font-style:${fs};color:${attr(p.color || "#374151")};font-size:${Number(p.fontSize) || 14}px;line-height:${p.lineHeight ?? 1.5};letter-spacing:${Number(p.letterSpacing) || 0}px;padding-right:${i < items.length - 1 ? gap : 0}px">${esc(it.text)}</a>`,
      ).join("");
      return `<mj-text align="${attr(p.align || "center")}" padding="${mPad(p, 8)}">${links}</mj-text>`;
    }
    case "EmailSocial": {
      const list: { iconSrc: string; url: string }[] = Array.isArray(p.items) ? p.items : [];
      const withIcon = list.filter((it) => it.iconSrc);
      if (!withIcon.length) return "";
      const size = Number(p.iconSize) || 24;
      const gap = Number(p.itemGap ?? 12);
      const radius = Number(p.radius) || 0;
      const icons = withIcon.map((it, i) =>
        `<a href="${attr(it.url || "#")}" style="display:inline-block;padding-right:${i < withIcon.length - 1 ? gap : 0}px"><img src="${attr(it.iconSrc)}" alt="" width="${size}" height="${size}" style="border-radius:${radius}px;display:inline-block" /></a>`,
      ).join("");
      return `<mj-text align="${attr(p.align || "center")}" padding="${mPad(p)}">${icons}</mj-text>`;
    }
    default:
      return "";
  }
}

function column(nodes: SNodes, id: string): string {
  const n = nodes[id]; if (!n) return "";
  const p = n.props ?? {};
  const inner = (n.nodes ?? []).map((b) => block(nodes[b])).join("");
  if (!inner) return ""; // empty column (no rendered content) — omit from the email
  const bg = p.bgColor && p.bgColor !== "transparent" ? ` background-color="${attr(p.bgColor)}"` : "";
  return `<mj-column${bg} vertical-align="${attr(p.verticalAlign || "top")}" padding="${Number(p.paddingY) || 0}px ${Number(p.paddingX) ?? 8}px">${inner}</mj-column>`;
}

function section(nodes: SNodes, id: string): string {
  const n = nodes[id]; if (!n) return "";
  const p = n.props ?? {};
  const colIds = n.nodes ?? [];
  // reverse-on-mobile: emit columns in reverse + direction="rtl" so desktop
  // shows the editor order while the mobile stack is reversed. Moot (and
  // skipped) when stacking is disabled — grouped columns never stack.
  const reverse = !!p.reverseOnMobile && !p.disableStacking;
  const order = reverse ? [...colIds].reverse() : colIds;
  const cols = order.map((c) => column(nodes, c)).filter(Boolean).join("");
  if (!cols) return ""; // section with no content columns — omit from the email
  const inner = p.disableStacking ? `<mj-group>${cols}</mj-group>` : cols;
  const a: string[] = [];
  if (p.bgColor && p.bgColor !== "transparent") a.push(`background-color="${attr(p.bgColor)}"`);
  if (p.bgImage) {
    const d = p.bgDisplay || "cover";
    const size = d === "contain" ? "contain" : d === "repeat" || d === "actual" ? "auto" : "cover";
    a.push(`background-url="${attr(p.bgImage)}"`, `background-size="${size}"`, `background-repeat="${d === "repeat" ? "repeat" : "no-repeat"}"`, `background-position="${attr(p.bgPosition || "center center")}"`);
  }
  if (reverse) a.push(`direction="rtl"`);
  if (Number(p.borderRadius)) a.push(`border-radius="${Number(p.borderRadius)}px"`);
  a.push(`padding="${Number(p.paddingY) || 8}px ${Number(p.paddingX) || 0}px"`);
  return `<mj-section ${a.join(" ")}>${inner}</mj-section>`;
}

export function craftToMjml(serialized: string, opts: { extraSections?: string } = {}): string {
  let nodes: SNodes;
  try { nodes = JSON.parse(serialized); } catch { nodes = {}; }
  const root = nodes["ROOT"] ?? ({} as SNode);
  const pp = root.props ?? {};
  const width = Number(pp.width) || 600;
  const breakpoint = Number(pp.breakpoint) || 480;
  const pageBg = pp.bgColor || "#f3f4f6";
  const fontStack = emailFontCss(pp.fontFamily);   // font lives in the doc (Page.fontFamily)
  const fontSize = Number(pp.fontSize) || 14;
  const textColor = pp.textColor || "#374151";

  const body = (root.nodes ?? []).map((id) => section(nodes, id)).join("") + (opts.extraSections ?? "");

  return [
    `<mjml><mj-head>`,
    `<mj-breakpoint width="${breakpoint}px" />`,
    `<mj-attributes>`,
    `<mj-all font-family="${attr(fontStack)}" />`,
    `<mj-text font-size="${fontSize}px" color="${attr(textColor)}" line-height="1.6" />`,
    `</mj-attributes></mj-head>`,
    `<mj-body width="${width}px" background-color="${attr(pageBg)}">`,
    body || `<mj-section><mj-column><mj-text align="center" color="#9ca3af">Empty email</mj-text></mj-column></mj-section>`,
    `</mj-body></mjml>`,
  ].join("");
}

export function unsubscribeSectionMjml(unsubscribeText: string, physicalAddress?: string | null): string {
  const m = unsubscribeText.match(/\{([^{}]+)\}/);
  const label = m ? m[1] : "unsubscribe";
  const idx = m ? m.index! : unsubscribeText.length;
  const before = esc(unsubscribeText.slice(0, idx));
  const after = m ? esc(unsubscribeText.slice(idx + m[0].length)) : "";
  const addr = physicalAddress?.trim()
    ? `<mj-text align="center" font-size="12px" color="#9ca3af" padding="0 0 4px 0">${ml(physicalAddress.trim())}</mj-text>`
    : "";
  return [
    `<mj-section padding="0"><mj-column>`,
    `<mj-divider border-color="#e5e7eb" border-width="1px" padding="16px 0 8px 0" />`,
    addr,
    `<mj-text align="center" font-size="12px" color="#9ca3af">${before}<a href="{{unsubscribeUrl}}" style="color:#6b7280;text-decoration:underline">${esc(label)}</a>${after}</mj-text>`,
    `</mj-column></mj-section>`,
  ].join("");
}

export function craftContainsUnsubscribe(serialized: string): boolean {
  return serialized.includes("{{unsubscribeUrl}}");
}
