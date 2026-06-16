import { NextRequest } from "next/server";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { sampleVars } from "@launchtic/email";
import { renderEmailContent } from "@launchtic/email/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Render an email body (Craft JSON or legacy maily) → responsive HTML with
// sample data. Used by every editor's Preview tab.
export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("email_templates:read");
    if (!r.ok) return r.response;
    const { body, font } = await req.json();
    if (typeof body !== "string") return err("Missing body", 400);
    const html = await renderEmailContent(body, sampleVars(), { font: font ?? null });
    return ok({ html });
  } catch (e: any) {
    return handleError(e);
  }
}
