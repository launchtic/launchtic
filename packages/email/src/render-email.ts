// SERVER-ONLY email renderer (Craft → MJML → responsive HTML). Pulls in `mjml`
// (Node-only) so it must NOT be imported from the browser-safe entry (index.ts).
// Exposed via server.ts.
//
// Unsubscribe is NOT auto-appended — authors add the {{unsubscribeUrl}} variable
// themselves wherever they want it.

import { render, type RenderVars } from "./render";
import { craftToMjml, isCraftDoc } from "./craft-mjml";

export async function renderEmailContent(content: string, vars: RenderVars): Promise<string> {
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
  return render(html, vars);
}
