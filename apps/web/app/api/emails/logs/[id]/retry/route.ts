import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { render, renderEmailContent, buildUnsubscribeUrl } from "@launchtic/email/server";
import { ok, err, handleError } from "../../../../../../lib/api";
import { requireAccess } from "../../../../../../lib/permissions";
import { emailQueue, type EmailJobData } from "../../../../../../lib/queue";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("emails:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const log = await db.emailSend.findFirst({
      where: { id, workspaceId },
      include: {
        broadcast:        { select: { id: true, subject: true, htmlBody: true, fromEmail: true, fromName: true } },
        template:         { select: { id: true, subject: true, htmlBody: true } },
        sequenceStep:     { select: { id: true, emailSubject: true, emailHtmlBody: true, emailFromName: true, emailFromEmail: true } },
        automationAction: { select: { id: true, emailSubject: true, emailHtmlBody: true, emailFromName: true, emailFromEmail: true } },
        contact:          { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!log) return err("Email log not found", 404);
    if (log.status !== "FAILED" && log.status !== "BOUNCED") {
      return err(`Cannot retry email with status ${log.status}`, 400);
    }

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const smtp = (settings as { smtp?: unknown } | null)?.smtp as Record<string, unknown> | undefined;
    if (!smtp?.host || !smtp?.passwordEnc) {
      return err("SMTP not configured. Configure it in Settings → SMTP first.", 400);
    }

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
    if (!sourceHtml || !sourceSubject) {
      return err("Cannot retry — source content not available.", 400);
    }

    // Resolve sender from snapshot. Broadcast / step / action all carry their
    // own from-fields; templates don't, so fall back to the workspace's
    // default Sender Identity.
    let fromEmail: string | null =
      log.broadcast?.fromEmail ??
      log.sequenceStep?.emailFromEmail ??
      log.automationAction?.emailFromEmail ??
      null;
    let fromName: string | null =
      log.broadcast?.fromName ??
      log.sequenceStep?.emailFromName ??
      log.automationAction?.emailFromName ??
      null;
    if (!fromEmail || !fromName) {
      const def = await db.senderIdentity.findFirst({
        where: { workspaceId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { name: true, email: true },
      });
      if (!def) return err("Add a Sender Identity in Settings before retrying.", 400);
      fromEmail = def.email;
      fromName  = def.name;
    }

    const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    const workspaceName = workspace?.name ?? "Your Workspace";

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
    const subject = render(sourceSubject, vars);
    const html    = await renderEmailContent(sourceHtml, vars);

    await db.emailSend.update({
      where: { id: log.id },
      data: { status: "QUEUED", failedAt: null, errorMessage: null, bodyHtml: html },
    });

    if (log.broadcastId) {
      await db.broadcast.update({
        where: { id: log.broadcastId },
        data: { failedCount: { decrement: 1 } },
      }).catch(() => {});
    }

    const jobData: EmailJobData = {
      emailSendId: log.id,
      workspaceId,
      contactId: log.contactId ?? undefined,
      to: log.toEmail,
      subject,
      html,
      fromEmail,
      fromName,
      broadcastId: log.broadcastId ?? undefined,
    };

    await emailQueue().add("send", jobData);

    return ok({ retried: true });
  } catch (error) {
    return handleError(error);
  }
}
