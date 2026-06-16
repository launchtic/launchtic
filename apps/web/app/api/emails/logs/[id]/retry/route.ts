import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { render, renderEmailContent, buildUnsubscribeUrl } from "@launchtic/email/server";
import { getAppUrl } from "../../../../../../lib/system-config";
import { ok, err, handleError } from "../../../../../../lib/api";
import { requireAccess } from "../../../../../../lib/permissions";
import { emailQueue, type EmailJobData } from "../../../../../../lib/queue";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("email_logs:resend");
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
    if (log.status !== "FAILED" && log.status !== "BOUNCED") {
      return err(`Cannot retry email with status ${log.status}`, 400);
    }

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const smtp = (settings as { smtp?: unknown } | null)?.smtp as Record<string, unknown> | undefined;
    if (!smtp?.host || !smtp?.password) {
      return err("SMTP not configured. Configure it in Settings → SMTP first.", 400);
    }

    // Resolve fresh source content + sender identity (Pattern B).
    // FK relations no longer auto-include — switch on sourceType and load the
    // matching row manually. BROADCAST sends carry their own fromEmail/fromName
    // on the broadcast row; WORKFLOW/TEMPLATE/SYSTEM fall through to the
    // workspace's default Sender Identity.
    let liveSourceHtml:    string | null = null;
    let liveSourceSubject: string | null = null;
    let liveFromEmail:     string | null = null;
    let liveFromName:      string | null = null;
    let broadcastIdForCounter: string | null = null;

    if (log.sourceType === "BROADCAST" && log.sourceId) {
      const b = await db.broadcast.findUnique({
        where: { id: log.sourceId },
        select: { id: true, subject: true, htmlBody: true, fromEmail: true, fromName: true },
      });
      if (b) {
        liveSourceHtml    = b.htmlBody;
        liveSourceSubject = b.subject;
        liveFromEmail     = b.fromEmail;
        liveFromName      = b.fromName;
        broadcastIdForCounter = b.id;
      }
    }
    // WORKFLOW + SYSTEM retries don't re-resolve a live source — workflow
    // emails get edited frequently and a retry should reflect what was
    // originally queued, not a current (possibly very different) draft.
    // SYSTEM rows have no live source row to read from. Both fall through to
    // the bodyHtml snapshot below.

    // Snapshot fallback: log.bodyHtml is always populated on new sends.
    const sourceHtml    = liveSourceHtml    ?? log.bodyHtml ?? null;
    const sourceSubject = liveSourceSubject ?? log.subject  ?? null;
    if (!sourceHtml || !sourceSubject) {
      return err("Cannot retry — source content not available.", 400);
    }

    // Sender resolution
    let fromEmail = liveFromEmail;
    let fromName  = liveFromName;
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

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
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
      unsubscribeUrl: c ? buildUnsubscribeUrl(c.id, await getAppUrl()) : "#unsubscribe",
    };
    const subject = render(sourceSubject, vars);
    const html    = await renderEmailContent(sourceHtml, vars);

    await db.emailSend.update({
      where: { id: log.id },
      data: { status: "QUEUED", failedAt: null, errorMessage: null, bodyHtml: html },
    });

    if (broadcastIdForCounter) {
      await db.broadcast.update({
        where: { id: broadcastIdForCounter },
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
      broadcastId: broadcastIdForCounter ?? undefined,
    };

    await emailQueue().add("send", jobData);

    return ok({ retried: true });
  } catch (error) {
    return handleError(error);
  }
}
