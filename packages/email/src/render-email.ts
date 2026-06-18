// SERVER-ONLY email renderer (Craft → MJML → responsive HTML). Pulls in `mjml`
// (Node-only) so it must NOT be imported from the browser-safe entry (index.ts).
// Exposed via server.ts.
//
// Unsubscribe is NOT auto-appended — authors add the {{unsubscribeUrl}} variable
// themselves wherever they want it.

import { render, type RenderVars } from "./render";
import { craftToMjml, isCraftDoc } from "./craft-mjml";

// Email clients can't resolve root-relative URLs (e.g. /uploads/icon.svg) — they
// have no page origin. Rewrite src/href/background + CSS url() that start with a
// single "/" to absolute using the app's public base URL. Skips //-protocol and
// already-absolute (http) URLs.
function absolutizeUrls(html: string, baseUrl: string): string {
  const b = baseUrl.replace(/\/+$/, "");
  return html
    .replace(/(\s(?:src|href|background)=)(["'])(\/(?!\/)[^"']*)\2/gi, (_m, pre, q, path) => `${pre}${q}${b}${path}${q}`)
    .replace(/url\((['"]?)(\/(?!\/)[^'")]*)\1\)/gi, (_m, q, path) => `url(${q}${b}${path}${q})`);
}

export async function renderEmailContent(content: string, vars: RenderVars, baseUrl?: string): Promise<string> {
  const trimmed = (content ?? "").trim();

  // Pre-migration (legacy maily) docs are no longer renderable — return a
  // notice instead of crashing sends / log previews.
  if (!isCraftDoc(trimmed)) {
    return render(
      `<div style="font-family:Arial,sans-serif;padding:24px;color:#6b7280;font-size:14px">This email was created with the previous editor and needs to be rebuilt.</div>`,
      vars,
    );
  }

  const mjmlStr = craftToMjml(trimmed);
  // @ts-ignore — mjml ships no type declarations
  const mjml2html = (await import("mjml")).default as (m: string, o?: any) => Promise<{ html: string }>;
  const { html } = await mjml2html(mjmlStr, { validationLevel: "soft" }); // mjml v5 is async
  const out = render(html, vars);
  return baseUrl ? absolutizeUrls(out, baseUrl) : out;
}
