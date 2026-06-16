"use client";

// Craft.js email blocks — Page → Section → Column → content, mirroring MJML.
// resolvedName + props MUST match the serializer in @launchtic/email
// (craft-mjml.ts). Borders/toolbar on hover+select are handled by RenderNode.

import { useNode, Element } from "@craftjs/core";
import type { ReactNode } from "react";

function useBlockRef() {
  const { connectors: { connect, drag } } = useNode();
  return (r: HTMLElement | null) => { if (r) connect(drag(r)); };
}

// ── Page (ROOT) — the whole outer area; holds Sections; page/theme settings ──
export function Page({ children, bgColor, fontSize, textColor, width }: any) {
  const { connectors: { connect } } = useNode();
  return (
    <div ref={(r) => { if (r) connect(r); }} style={{ background: bgColor, padding: "32px 16px", minHeight: "100%", fontSize, color: textColor }}>
      <div style={{ maxWidth: width, margin: "0 auto", minHeight: 320 }}>{children}</div>
    </div>
  );
}
Page.craft = {
  displayName: "Page",
  props: { width: 600, breakpoint: 480, bgColor: "#f3f4f6", fontSize: 14, textColor: "#374151" },
  rules: { canMoveIn: (nodes: any[]) => nodes.every((n) => n.data.name === "Section") },
};

// ── Section — full-width row holding Columns ─────────────────────────────────
// bgDisplay maps to background-size/repeat: cover | contain | repeat | actual.
export function bgImageStyle(bgImage?: string, bgDisplay?: string, bgPosition?: string) {
  if (!bgImage) return {};
  return {
    backgroundImage: `url("${bgImage}")`,
    backgroundSize: bgDisplay === "contain" || bgDisplay === "actual" ? (bgDisplay === "contain" ? "contain" : "auto") : bgDisplay === "repeat" ? "auto" : "cover",
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
  props: { bgColor: "transparent", paddingY: 8, paddingX: 0, bgImage: "", bgDisplay: "cover", bgPosition: "center center", borderRadius: 0 },
  rules: { canMoveIn: (nodes: any[]) => nodes.every((n) => n.data.name === "Column") },
};

// ── Column — holds content blocks ────────────────────────────────────────────
export function Column({ children, bgColor, paddingY, paddingX, verticalAlign }: any) {
  const { connectors: { connect } } = useNode();
  return (
    <div ref={(r) => { if (r) connect(r); }}
      style={{ flex: 1, minWidth: 0, background: bgColor, padding: `${paddingY}px ${paddingX}px`, display: "flex", flexDirection: "column", justifyContent: verticalAlign === "middle" ? "center" : verticalAlign === "bottom" ? "flex-end" : "flex-start", border: "1px dashed #e5e7eb", borderRadius: 4, minHeight: 36 }}>
      {children}
    </div>
  );
}
Column.craft = {
  displayName: "Column",
  props: { bgColor: "transparent", paddingY: 0, paddingX: 8, verticalAlign: "top" },
  rules: { canMoveIn: (nodes: any[]) => nodes.every((n) => !["Section", "Column", "Page"].includes(n.data.name)) },
};

// ── Content blocks ───────────────────────────────────────────────────────────
export function EmailHeading({ text, fontSize, color, align }: any) {
  const ref = useBlockRef();
  return <h1 ref={ref as any} style={{ fontSize, color, textAlign: align, fontWeight: 700, margin: "8px 0", cursor: "move", whiteSpace: "pre-wrap" }}>{text}</h1>;
}
EmailHeading.craft = { displayName: "Heading", props: { text: "Your heading", fontSize: 24, color: "#111827", align: "left" } };

export function EmailText({ text, fontSize, color, align }: any) {
  const ref = useBlockRef();
  return <p ref={ref as any} style={{ fontSize, color, textAlign: align, lineHeight: 1.6, margin: "8px 0", cursor: "move", whiteSpace: "pre-wrap" }}>{text}</p>;
}
EmailText.craft = { displayName: "Text", props: { text: "Some body text.", fontSize: 14, color: "#374151", align: "left" } };

export function EmailButton({ text, href, bg, color, align, radius }: any) {
  const ref = useBlockRef();
  return (
    <div style={{ textAlign: align, margin: "12px 0" }}>
      <span ref={ref as any} style={{ display: "inline-block", background: bg, color, padding: "10px 24px", borderRadius: radius, fontSize: 14, fontWeight: 500, cursor: "move" }}>{text}</span>
    </div>
  );
}
EmailButton.craft = { displayName: "Button", props: { text: "Click me", href: "#", bg: "#2563eb", color: "#ffffff", align: "center", radius: 6 } };

export function EmailImage({ src, alt, width, href, align }: any) {
  const ref = useBlockRef();
  const img = src
    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt={alt} style={{ maxWidth: "100%", width: width ? `${width}px` : undefined, display: "inline-block" }} />
    : <div style={{ background: "#f3f4f6", color: "#9ca3af", textAlign: "center", padding: 24, fontSize: 13 }}>Image — choose one in the panel →</div>;
  return <div ref={ref as any} style={{ margin: "8px 0", textAlign: align, cursor: "move" }}>{href && src ? <span title={href}>{img}</span> : img}</div>;
}
EmailImage.craft = { displayName: "Image", props: { src: "", alt: "", width: null, href: "", align: "center" } };

export function EmailDivider({ color }: any) {
  const ref = useBlockRef();
  return <div ref={ref as any} style={{ margin: "8px 0", cursor: "move" }}><hr style={{ border: "none", borderTop: `1px solid ${color}` }} /></div>;
}
EmailDivider.craft = { displayName: "Divider", props: { color: "#e5e7eb" } };

export function EmailSpacer({ height }: any) {
  const ref = useBlockRef();
  return <div ref={ref as any} style={{ height, cursor: "move", background: "repeating-linear-gradient(45deg,#f9fafb,#f9fafb 6px,#f3f4f6 6px,#f3f4f6 12px)" }} />;
}
EmailSpacer.craft = { displayName: "Spacer", props: { height: 24 } };

export const EMAIL_RESOLVER = { Page, Section, Column, EmailHeading, EmailText, EmailButton, EmailImage, EmailDivider, EmailSpacer };
export { Element };
