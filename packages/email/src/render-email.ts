// SERVER-ONLY email renderer (Craft → MJML → responsive HTML). Pulls in `mjml`
// (Node-only) so it must NOT be imported from the browser-safe entry (index.ts).
// Exposed via server.ts.

import { render, type RenderVars } from "./render";
import { craftToMjml, isCraftDoc, unsubscribeSectionMjml, craftContainsUnsubscribe } from "./craft-mjml";

export type RenderOptions = {
  appendUnsubscribe?: boolean;
  unsubscribeText?: string | null;
  physicalAddress?: string | null;
};

const DEFAULT_UNSUB_TEXT = "Don't want these emails? You can {unsubscribe} anytime.";

export async function renderEmailContent(
  content: string,
  vars: RenderVars,
  opts: RenderOptions = {},
): Promise<string> {
  const trimmed = (content ?? "").trim();

  // Pre-migration (legacy maily) docs are no longer renderable — return a
  // notice instead of crashing sends / log previews.
  if (!isCraftDoc(trimmed)) {
    return render(
      `<div style="font-family:Arial,sans-serif;padding:24px;color:#6b7280;font-size:14px">This email was created with the previous editor and needs to be rebuilt.</div>`,
      vars,
    );
  }

  let extra = "";
  if (opts.appendUnsubscribe && !craftContainsUnsubscribe(trimmed)) {
    extra = unsubscribeSectionMjml(opts.unsubscribeText?.trim() || DEFAULT_UNSUB_TEXT, opts.physicalAddress);
  }
  const mjmlStr = craftToMjml(trimmed, { extraSections: extra });
  // @ts-ignore — mjml ships no type declarations
  const mjml2html = (await import("mjml")).default as (m: string, o?: any) => Promise<{ html: string }>;
  const { html } = await mjml2html(mjmlStr, { validationLevel: "soft" }); // mjml v5 is async
  return render(html, vars);
}
