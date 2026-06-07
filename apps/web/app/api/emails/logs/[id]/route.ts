import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { render, renderEmailContent, buildUnsubscribeUrl } from "@launchtic/email/server";
import { getAppUrl } from "../../../../../lib/system-config";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

// TEMPLATE is intentionally absent — see /api/emails/logs (list) for rationale.
type SourceType = "BROADCAST" | "WORKFLOW" | "SYSTEM";

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("email_logs:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const log = await db.emailSend.findFirst({
      where: { id, workspaceId },
      include: {
        contact: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!log) return err("Email log not found", 404);

    // Workspace slug needed for source hrefs (pages live under `/${slug}/...`).
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, slug: true },
    });
    const workspaceName = workspace?.name ?? "Your Workspace";
    const workspaceSlug = workspace?.slug ?? "";

    // ─── Source dispatch (Pattern B) ─────────────────────────────────────────
    // FK relations are gone; resolve the source row on-demand per sourceType
    // so we can (a) build the navigation href and (b) re-render the email
    // preview from the live source when bodyHtml snapshot is missing.
    const sourceType: SourceType = (log.sourceType as SourceType | null) ?? "SYSTEM";
    const sourceId = log.sourceId;
    // Default source label comes from the snapshot. We refresh it with the
    // current live source name below if the source row still exists, so a
    // recent rename surfaces immediately.
    let sourceName: string = log.sourceLabel ?? "System";
    let sourceHref: string | null = null;
    let liveSourceHtml: string | null = null;
    let liveSourceSubject: string | null = null;

    if (sourceType === "BROADCAST" && sourceId) {
      const b = await db.broadcast.findUnique({
        where: { id: sourceId },
        select: { id: true, name: true, subject: true, htmlBody: true },
      });
      if (b) {
        sourceName       = b.name;
        liveSourceHtml   = b.htmlBody;
        liveSourceSubject = b.subject;
        sourceHref = workspaceSlug ? `/${workspaceSlug}/emails/broadcasts/${b.id}` : null;
      } else if (!log.sourceLabel) {
        sourceName = "Broadcast (deleted)";
      }
    } else if (sourceType === "WORKFLOW" && sourceId) {
      const we = await db.workflowEmail.findUnique({
        where: { id: sourceId },
        select: {
          id: true, name: true, subject: true, bodyHtml: true,
          workflowId: true,
          workflow:   { select: { name: true } },
        },
      });
      if (we) {
        // Disambiguate by parent workflow — multiple workflows can have
        // emails with the same subject.
        sourceName = `${we.workflow.name} · ${we.name || we.subject || "(untitled)"}`;
        liveSourceHtml   = we.bodyHtml;
        liveSourceSubject = we.subject;
        sourceHref = workspaceSlug
          ? `/${workspaceSlug}/workflows/${we.workflowId}/emails/${we.id}/edit`
          : null;
      } else if (!log.sourceLabel) {
        sourceName = "Workflow (deleted)";
      }
    }
    // SYSTEM rows have no href and use sourceLabel as-is (already assigned).

    // ─── Preview render priority ─────────────────────────────────────────────
    //   1. log.bodyHtml — stored snapshot of what was actually sent (truth)
    //   2. Re-render from live source — for legacy rows missing bodyHtml.
    //      Diverges if the source was edited after send; warn the user.
    let previewHtml: string | null = null;
    let previewSubject: string | null = null;
    let previewAvailable = false;
    let previewWarning: string | null = null;

    if (log.bodyHtml) {
      previewHtml = log.bodyHtml;
      previewSubject = log.subject;
      previewAvailable = true;
    } else if (liveSourceHtml && liveSourceSubject) {
      const c = log.contact;
      const firstName = c?.firstName ?? "";
      const lastName  = c?.lastName  ?? "";
      const email     = c?.email     ?? log.toEmail;
      const fullName  = [firstName, lastName].filter(Boolean).join(" ").trim() || email;
      const vars = {
        contact: { firstName, lastName, email, fullName },
        workspace: { name: workspaceName },
        order: {},
        unsubscribeUrl: c ? buildUnsubscribeUrl(c.id, await getAppUrl()) : "#unsubscribe",
      };
      previewSubject = render(liveSourceSubject, vars);
      previewHtml = await renderEmailContent(liveSourceHtml, vars);
      previewAvailable = true;
      previewWarning = c
        ? "Re-rendered from source — diverges if the source was edited after send."
        : "Contact has been deleted — preview rendered with placeholder data.";
    } else {
      previewWarning = "Preview unavailable — source content not stored.";
    }

    return ok({
      id: log.id,
      toEmail: log.toEmail,
      subject: log.subject,
      status: log.status,
      errorMessage: log.errorMessage,
      providerMessageId: log.providerMessageId,
      queuedAt: log.queuedAt.toISOString(),
      sentAt:   log.sentAt?.toISOString()   ?? null,
      failedAt: log.failedAt?.toISOString() ?? null,
      contact: log.contact ? {
        id: log.contact.id,
        email: log.contact.email,
        firstName: log.contact.firstName,
        lastName: log.contact.lastName,
      } : null,
      source: { type: sourceType, name: sourceName, href: sourceHref },
      preview: {
        available: previewAvailable,
        subject: previewSubject,
        html: previewHtml,
        warning: previewWarning,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
