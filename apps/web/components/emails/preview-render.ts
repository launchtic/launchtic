// Shared preview render helper — used by EmailComposeDrawer, TemplateEditor,
// and BroadcastDetail to render the maily JSON into HTML for an iframe.
//
// Two reasons for the wrapper over `mailyRender(json)`:
//
// 1. Theme overrides — strip the default 600px centered container so the
//    iframe content fills available width and matches the editor's WYSIWYG
//    layout exactly.
//
// 2. Font override — maily ships Inter as default, loaded via
//    @react-email/components <Font> (only weight 400 actually loaded, so
//    bold/extra-bold headings fall back). We swap to classic web-safe
//    Arial/Helvetica which renders consistently across ALL email clients
//    (Outlook desktop notably strips @font-face) and matches what real
//    recipients see. Since these are system fonts, no webfont loading
//    needed — overriding via injected CSS is enough.
//
// Email recipients still get whatever their client supports — this only
// affects the in-app preview iframe rendering.

import type { JSONContent } from "@tiptap/core";

const FLUSH_LAYOUT_THEME = {
  container: {
    maxWidth: "100%",
    paddingTop: "0",
    paddingRight: "0",
    paddingBottom: "0",
    paddingLeft: "0",
  },
};

// Force Arial/Helvetica on every element — overrides maily's default Inter
// and any inline font-family the email blocks may set. Mirrors the
// font-family rule in globals.css for the editor.
const FONT_OVERRIDE_STYLE = `
<style>
  body, body * {
    font-family: Arial, Helvetica, sans-serif !important;
  }
</style>
`;

export async function renderPreviewHtml(json: JSONContent): Promise<string> {
  const { render: mailyRender } = await import("@maily-to/render");
  const html = await mailyRender(json, { theme: FLUSH_LAYOUT_THEME });
  if (html.includes("</head>")) {
    return html.replace("</head>", `${FONT_OVERRIDE_STYLE}</head>`);
  }
  // Defensive: if no </head>, prepend a minimal head with the override.
  return `<!DOCTYPE html><html><head>${FONT_OVERRIDE_STYLE}</head><body>${html}</body></html>`;
}
