import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { render, renderEmailContent, buildUnsubscribeUrl, shouldShowLaunchticBadge } from "@launchtic/email/server";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("email_logs:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const log = await db.emailSend.findFirst({
      where: { id, workspaceId },
      include: {
        broadcast:        { select: { id: true, name: true, subject: true, htmlBody: true } },
        template:         { select: { id: true, name: true, subject: true, htmlBody: true } },
        automation:       { select: { id: true, name: true } },
        automationAction: { select: { id: true, emailSubject: true, emailHtmlBody: true } },
        sequence:         { select: { id: true, name: true } },
        sequenceStep:     { select: { id: true, emailSubject: true, emailHtmlBody: true } },
        contact:          { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!log) return err("Email log not found", 404);

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, organization: { select: { plan: true, licenseExpiresAt: true } } },
    });
    const workspaceName = workspace?.name ?? "Your Workspace";
    const appendPoweredByBadge = shouldShowLaunchticBadge(
      workspace?.organization?.plan,
      workspace?.organization?.licenseExpiresAt,
    );

    // Preview render priority:
    //   1. log.bodyHtml — stored snapshot of what was actually sent (truth)
    //   2. Re-render from source — for legacy rows missing bodyHtml. Diverges
    //      if the source was edited after send; warn the user.
    let previewHtml: string | null = null;
    let previewSubject: string | null = null;
    let previewAvailable = false;
    let previewWarning: string | null = null;

    if (log.bodyHtml) {
      previewHtml = log.bodyHtml;
      previewSubject = log.subject;
      previewAvailable = true;
    } else {
      const sourceHtml =
        log.broadcast?.htmlBody ??
        log.sequenceStep?.emailHtmlBody ??
        log.automationAction?.emailHtmlBody ??
        log.template?.htmlBody ??
        null;
      const sourceSubject =
        log.broadcast?.subject ??
        log.sequenceStep?.emailSubject ??
        log.automationAction?.emailSubject ??
        log.template?.subject ??
        null;

      if (sourceHtml && sourceSubject) {
        const c = log.contact;
        const firstName = c?.firstName ?? "";
        const lastName  = c?.lastName  ?? "";
        const email     = c?.email     ?? log.toEmail;
        const fullName  = [firstName, lastName].filter(Boolean).join(" ").trim() || email;
        const vars = {
          contact: { firstName, lastName, email, fullName },
          workspace: { name: workspaceName },
          order: {},
          unsubscribeUrl: c ? buildUnsubscribeUrl(c.id) : "#unsubscribe",
        };
        previewSubject = render(sourceSubject, vars);
        previewHtml = await renderEmailContent(sourceHtml, vars, { appendPoweredByBadge });
        previewAvailable = true;
        previewWarning = c
          ? "Re-rendered from source — diverges if the source was edited after send."
          : "Contact has been deleted — preview rendered with placeholder data.";
      } else {
        previewWarning = "Preview unavailable — source content not stored.";
      }
    }

    let sourceType: "BROADCAST" | "TEMPLATE" | "AUTOMATION" | "SEQUENCE" | "TRANSACTIONAL" = "TRANSACTIONAL";
    let sourceName: string = log.transactionalKey ?? "Transactional";
    let sourceHref: string | null = null;
    if (log.broadcast) {
      sourceType = "BROADCAST";
      sourceName = log.broadcast.name;
      sourceHref = `/emails/broadcasts/${log.broadcast.id}`;
    } else if (log.sequence) {
      sourceType = "SEQUENCE";
      sourceName = log.sequence.name;
      sourceHref = `/sequences/${log.sequence.id}`;
    } else if (log.automation) {
      sourceType = "AUTOMATION";
      sourceName = log.automation.name;
      sourceHref = `/automations/${log.automation.id}`;
    } else if (log.template) {
      sourceType = "TEMPLATE";
      sourceName = log.template.name;
      sourceHref = `/emails/templates/${log.template.id}`;
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
