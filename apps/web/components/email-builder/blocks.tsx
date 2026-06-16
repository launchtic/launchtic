"use client";

// Craft.js email blocks — Page → Section → Column → content, mirroring MJML.
// resolvedName + props MUST match the serializer in @launchtic/email
// (craft-mjml.ts). Borders/toolbar on hover+select are handled by RenderNode.

import { useNode, Element } from "@craftjs/core";
import { useEffect, useRef } from "react";
import { emailFontCss, DEFAULT_EMAIL_FONT } from "@launchtic/email";

function useBlockRef() {
  const { connectors: { connect, drag } } = useNode();
  return (r: HTMLElement | null) => { if (r) connect(drag(r)); };
}

// Inline rich-text editable (Heading/Text). Body is contentEditable; dragging
// is done via the RenderNode move handle (so text selection works). innerHTML
// is seeded once on mount so typing never loses the caret.
function RichEditable({ as: Tag, html, onInput, connectRef, style }: any) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (html || "")) ref.current.innerHTML = html || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Tag
      ref={(r: HTMLElement | null) => { ref.current = r; if (r) connectRef(r); }}
      contentEditable
      suppressContentEditableWarning
      data-rt="1"
      onInput={(e: any) => onInput(e.currentTarget.innerHTML)}
      style={{ outline: "none", ...style }}
    />
  );
}

// ── Page (ROOT) — the whole outer area; holds Sections; page/theme settings ──
export function Page({ children, bgColor, fontSize, textColor, width, fontFamily }: any) {
  const { connectors: { connect }, empty } = useNode((n) => ({ empty: n.data.nodes.length === 0 }));
  return (
    <div ref={(r) => { if (r) connect(r); }} style={{ background: bgColor, padding: "32px 16px", minHeight: "100%", fontSize, color: textColor, fontFamily: emailFontCss(fontFamily) }}>
      <div style={{ maxWidth: width, margin: "0 auto", minHeight: 320, position: "relative" }}>
        {children}
        {empty && (
          <div style={{ border: "2px dashed #818cf8", borderRadius: 8, padding: "48px 16px", textAlign: "center", color: "#6366f1", background: "#eef2ff" }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Drag a block here to start</p>
            <p style={{ fontSize: 12, color: "#818cf8" }}>Sections, or any element — it’ll wrap into a section automatically.</p>
          </div>
        )}
      </div>
    </div>
  );
}
Page.craft = {
  displayName: "Page",
  props: { width: 600, breakpoint: 480, bgColor: "#f3f4f6", fontSize: 14, textColor: "#374151", fontFamily: DEFAULT_EMAIL_FONT },
  // Accept anything; bare content dropped here is auto-wrapped in a Section by AutoWrap.
  rules: { canMoveIn: () => true },
};

// ── Section — full-width row holding Columns (+ background image/radius) ──────
export function bgImageStyle(bgImage?: string, bgDisplay?: string, bgPosition?: string) {
  if (!bgImage) return {};
  return {
    backgroundImage: `url("${bgImage}")`,
    backgroundSize: bgDisplay === "contain" ? "contain" : bgDisplay === "repeat" || bgDisplay === "actual" ? "auto" : "cover",
    backgroundRepeat: bgDisplay === "repeat" ? "repeat" : "no-repeat",
    backgroundPosition: bgPosition || "center center",
  } as Record<string, string>;
}
export function Section({ children, bgColor, paddingY, paddingX, bgImage, bgDisplay, bgPosition, borderRadius }: any) {
  const ref = useBlockRef();
  return (
    <div ref={ref as any} style={{ display: "flex", gap: 8, background: bgColor, ...bgImageStyle(bgImage, bgDisplay, bgPosition), padding: `${paddingY}px ${paddingX}px`, borderRadius: borderRadius || 0, cursor: "move" }}>
      {children}
    </div>
  );
}
Section.craft = {
  displayName: "Section",
  props: { bgColor: "#ffffff", paddingY: 10, paddingX: 10, bgImage: "", bgDisplay: "cover", bgPosition: "center center", borderRadius: 0 },
  rules: { canMoveIn: (nodes: any[]) => nodes.every((n) => n.data.name === "Column") },
};

// ── Column — holds content blocks ────────────────────────────────────────────
export function Column({ children, bgColor, paddingY, paddingX, verticalAlign }: any) {
  const { connectors: { connect }, empty } = useNode((n) => ({ empty: n.data.nodes.length === 0 }));
  return (
    <div ref={(r) => { if (r) connect(r); }}
      style={{ flex: 1, minWidth: 0, background: bgColor, padding: `${paddingY}px ${paddingX}px`, display: "flex", flexDirection: "column", justifyContent: verticalAlign === "middle" ? "center" : verticalAlign === "bottom" ? "flex-end" : "flex-start", border: empty ? "1px dashed #818cf8" : "none", borderRadius: 4, minHeight: 36 }}>
      {children}
      {empty && (
        <div style={{ textAlign: "center", color: "#a5b4fc", fontSize: 12, padding: "12px 4px", pointerEvents: "none" }}>Drop content here</div>
      )}
    </div>
  );
}
Column.craft = {
  displayName: "Column",
  props: { bgColor: "transparent", paddingY: 0, paddingX: 8, verticalAlign: "top" },
  rules: { canMoveIn: (nodes: any[]) => nodes.every((n) => !["Section", "Column", "Page"].includes(n.data.name)) },
};

// ── Content blocks ───────────────────────────────────────────────────────────
export function EmailHeading({ text, fontSize = 24, color, align, marginY = 8, marginX = 0, paddingY = 0, paddingX = 0 }: any) {
  const { connectors: { connect }, actions: { setProp } } = useNode();
  return <RichEditable as="h1" html={text} connectRef={connect} onInput={(h: string) => setProp((p: any) => { p.text = h; })} style={{ fontSize, color, textAlign: align, fontWeight: 700, margin: `${marginY}px ${marginX}px`, padding: `${paddingY}px ${paddingX}px`, whiteSpace: "pre-wrap" }} />;
}
EmailHeading.craft = { displayName: "Heading", props: { text: "Your heading", fontSize: 24, color: "#111827", align: "left", marginY: 8, marginX: 0, paddingY: 0, paddingX: 0 } };

export function EmailText({ text, fontSize = 14, color, align, marginY = 8, marginX = 0, paddingY = 0, paddingX = 0 }: any) {
  const { connectors: { connect }, actions: { setProp } } = useNode();
  return <RichEditable as="p" html={text} connectRef={connect} onInput={(h: string) => setProp((p: any) => { p.text = h; })} style={{ fontSize, color, textAlign: align, lineHeight: 1.6, margin: `${marginY}px ${marginX}px`, padding: `${paddingY}px ${paddingX}px`, whiteSpace: "pre-wrap" }} />;
}
EmailText.craft = { displayName: "Text", props: { text: "Some body text.", fontSize: 14, color: "#374151", align: "left", marginY: 8, marginX: 0, paddingY: 0, paddingX: 0 } };

export function EmailButton({ text, href, bg, color, align, radius, fontSize = 14, paddingY = 12, paddingX = 28, marginY = 12, marginX = 0 }: any) {
  const ref = useBlockRef();
  return (
    <div style={{ textAlign: align, margin: `${marginY}px ${marginX}px` }}>
      <span ref={ref as any} style={{ display: "inline-block", background: bg, color, padding: `${paddingY}px ${paddingX}px`, borderRadius: radius, fontSize, fontWeight: 500, cursor: "move" }}>{text}</span>
    </div>
  );
}
EmailButton.craft = { displayName: "Button", props: { text: "Click me", href: "#", bg: "#2563eb", color: "#ffffff", align: "center", radius: 6, fontSize: 14, paddingY: 12, paddingX: 28, marginY: 12, marginX: 0 } };

export function EmailImage({ src, alt, width, href, align, marginY = 8, marginX = 0 }: any) {
  const ref = useBlockRef();
  const img = src
    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt={alt} style={{ maxWidth: "100%", width: width ? `${width}px` : undefined, display: "inline-block" }} />
    : <div style={{ background: "#f3f4f6", color: "#9ca3af", textAlign: "center", padding: 24, fontSize: 13 }}>Image — choose one in the panel →</div>;
  return <div ref={ref as any} style={{ margin: `${marginY}px ${marginX}px`, textAlign: align, cursor: "move" }}>{href && src ? <span title={href}>{img}</span> : img}</div>;
}
EmailImage.craft = { displayName: "Image", props: { src: "", alt: "", width: null, href: "", align: "center", marginY: 8, marginX: 0 } };

export function EmailDivider({ color, thickness, style, paddingY }: any) {
  const ref = useBlockRef();
  return <div ref={ref as any} style={{ margin: `${paddingY ?? 8}px 0`, cursor: "move" }}><hr style={{ border: "none", borderTop: `${thickness || 1}px ${style || "solid"} ${color}` }} /></div>;
}
EmailDivider.craft = { displayName: "Divider", props: { color: "#e5e7eb", thickness: 1, style: "solid", paddingY: 8 } };

export function EmailSpacer({ height, bgColor }: any) {
  const ref = useBlockRef();
  const solid = bgColor && bgColor !== "transparent";
  return <div ref={ref as any} style={{ height, cursor: "move", background: solid ? bgColor : "repeating-linear-gradient(45deg,#f9fafb,#f9fafb 6px,#f3f4f6 6px,#f3f4f6 12px)" }} />;
}
EmailSpacer.craft = { displayName: "Spacer", props: { height: 24, bgColor: "transparent" } };

export function EmailNavbar({ items, align, paddingY, itemPadding, fontSize, color, lineHeight, letterSpacing }: any) {
  const ref = useBlockRef();
  const list: { text: string; href: string }[] = Array.isArray(items) ? items : [];
  return (
    <div ref={ref as any} style={{ textAlign: align, padding: `${paddingY}px 0`, cursor: "move" }}>
      {list.map((it, i) => (
        <span key={i} style={{ display: "inline-block", color, fontSize, lineHeight, letterSpacing: `${letterSpacing}px`, padding: `0 ${itemPadding}px`, textDecoration: "none" }}>{it.text}</span>
      ))}
    </div>
  );
}
EmailNavbar.craft = {
  displayName: "Navbar",
  props: { items: [{ text: "Home", href: "#" }, { text: "About", href: "#" }, { text: "Contact", href: "#" }], align: "center", paddingY: 8, itemPadding: 12, fontSize: 14, color: "#374151", lineHeight: 1.5, letterSpacing: 0 },
};

export const EMAIL_RESOLVER = { Page, Section, Column, EmailHeading, EmailText, EmailButton, EmailImage, EmailDivider, EmailSpacer, EmailNavbar };
export { Element };
