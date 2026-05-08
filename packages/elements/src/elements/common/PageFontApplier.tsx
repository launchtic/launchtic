"use client";

import React, { useEffect } from "react";

export type PageFont = {
  fontType?: string;
  fontFamily?: string;
  fontStyle?: string;
};

type Props = {
  font?: PageFont | null;
  children: React.ReactNode;
};

const GOOGLE_LINK_ID = "lt-page-google-font";

/**
 * Wraps page content and applies the page-level default font.
 *
 * - When fontType === 'google': loads the Google Font stylesheet via a <link>
 *   in <head>, then applies font-family + font-weight on the wrapper div.
 * - When fontType === 'web-safe': just applies font-family.
 * - When fontType === 'default' or undefined: renders children unchanged so
 *   the inherited (browser default) font is used.
 *
 * Elements inside Craft.js with `fontType: "default"` skip emitting their
 * own `font-family` rule — they will inherit from this wrapper via the
 * normal CSS cascade.
 */
export const PageFontApplier: React.FC<Props> = ({ font, children }) => {
  const fontType = font?.fontType;
  const fontFamily = font?.fontFamily;
  const fontStyle = font?.fontStyle;

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (fontType !== "google" || !fontFamily) {
      const existing = document.getElementById(GOOGLE_LINK_ID);
      if (existing) existing.remove();
      return;
    }

    const family = fontFamily.replace(/\s+/g, "+");
    // Request a useful weight range. If a specific weight is selected, also
    // include the italic axis variant when needed.
    const weight = (fontStyle ?? "400").replace("italic", "");
    const isItalic = (fontStyle ?? "").includes("italic");
    const axis = isItalic ? `ital,wght@1,${weight}` : `wght@${weight}`;
    const href = `https://fonts.googleapis.com/css2?family=${family}:${axis}&display=swap`;

    let link = document.getElementById(GOOGLE_LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = GOOGLE_LINK_ID;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;

    return () => {
      // Don't remove on unmount in normal navigation — the next page will
      // either reuse or replace the link. Only clean up when the font type
      // is removed entirely (handled in the early-return branch above).
    };
  }, [fontType, fontFamily, fontStyle]);

  if (!fontType || fontType === "default" || !fontFamily) {
    return <>{children}</>;
  }

  const isItalic = (fontStyle ?? "").includes("italic");
  const weight = (fontStyle ?? "").replace("italic", "");

  // For web-safe values that already contain commas (font stack), use as-is.
  // For google fonts, quote the family name and add a sans-serif fallback.
  const cssFamily = fontType === "google" ? `'${fontFamily}', sans-serif` : fontFamily;

  return (
    <div
      style={{
        fontFamily: cssFamily,
        ...(weight ? { fontWeight: weight } : {}),
        ...(isItalic ? { fontStyle: "italic" } : {}),
      }}
    >
      {children}
    </div>
  );
};
