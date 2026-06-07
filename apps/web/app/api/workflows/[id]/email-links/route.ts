// Extract distinct http(s) links from a broadcast's or workflow email's
// bodyHtml — used by the workflow builder's link-filter picker on the
// EMAIL_LINK_CLICKED trigger.
//
// Body parsing happens on-demand here (rather than eager-loading every
// broadcast/email bodyHtml in the editor page) so the editor stays light.
//
// Query: ?source=broadcast|workflow_email&sourceId=<id>
// Response: { urls: string[] }   — deduped, original-order preserved.

import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

// Same pattern as packages/email/src/tracking.ts so the picker shows the
// same URLs that the link rewriter would track at send time.
const HREF_RE = /href=(["'])(https?:\/\/[^"']+)\1/gi;

function extractLinks(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.matchAll(HREF_RE)) {
    const url = m[2];
    // Skip unsubscribe URLs — they're contact-specific and never useful as
    // a trigger filter. Loose match: anything with "/u/<id>/<token>" or the
    // raw {{unsubscribeUrl}} placeholder.
    if (url.includes("{{unsubscribeUrl}}")) continue;
    if (/\/u\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/i.test(url)) continue;
    if (!seen.has(url)) { seen.add(url); out.push(url); }
  }
  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess("workflows:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    const { id } = await params;

    // Ownership check — workflow must belong to the caller's workspace so
    // we don't leak broadcasts / emails from other workspaces via a stolen
    // workflow id.
    const wf = await db.workflow.findFirst({
      where:  { id, workspaceId },
      select: { id: true },
    });
    if (!wf) return err("Workflow not found", 404);

    const source   = req.nextUrl.searchParams.get("source");
    const sourceId = req.nextUrl.searchParams.get("sourceId");
    if (!sourceId) return err("sourceId is required", 400);

    let html = "";
    if (source === "broadcast") {
      const b = await db.broadcast.findFirst({
        where:  { id: sourceId, workspaceId },
        select: { htmlBody: true },
      });
      if (!b) return err("Broadcast not found", 404);
      html = b.htmlBody ?? "";
    } else if (source === "workflow_email") {
      // Allow cross-workflow lookup within the same workspace — the trigger
      // picker for "workflow_email" source is workspace-scoped (any active
      // workflow's email can be the upstream that triggers this one).
      const e = await db.workflowEmail.findFirst({
        where:  { id: sourceId, workflow: { workspaceId } },
        select: { bodyHtml: true },
      });
      if (!e) return err("Workflow email not found", 404);
      html = e.bodyHtml ?? "";
    } else {
      return err("source must be 'broadcast' or 'workflow_email'", 400);
    }

    return ok({ urls: extractLinks(html) });
  } catch (error) {
    return handleError(error);
  }
}
