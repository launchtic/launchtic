import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { render, renderEmailContent, buildUnsubscribeUrl } from "@launchtic/email/server";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { emailQueue, type EmailJobData } from "../../../../../lib/queue";

const BATCH_SIZE = 200;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("emails:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const broadcast = await db.broadcast.findFirst({ where: { id, workspaceId } });
    if (!broadcast) return err("Broadcast not found", 404);
    if (broadcast.status !== "SENT" && broadcast.status !== "FAILED") {
      return err(`Cannot retry broadcast with status ${broadcast.status}`, 400);
    }

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const smtp = (settings as { smtp?: unknown } | null)?.smtp as Record<string, unknown> | undefined;
    if (!smtp?.host || !smtp?.passwordEnc) {
      return err("SMTP not configured. Configure it in Settings → SMTP first.", 400);
    }

    const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
    const workspaceName = workspace?.name ?? "Your Workspace";

    const queue = emailQueue();

    let retried = 0;
    let cursorId: string | null = null;

    while (true) {
      const failed: { id: string; contactId: string | null; toEmail: string }[] =
        await db.emailSend.findMany({
          where: { broadcastId: id, workspaceId, status: "FAILED" },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
          select: { id: true, contactId: true, toEmail: true },
        });

      if (failed.length === 0) break;
      cursorId = failed[failed.length - 1].id;

      const contactIds = failed.map((s) => s.contactId).filter((c): c is string => !!c);
      const contacts = await db.contact.findMany({
        where: { id: { in: contactIds }, workspaceId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      const contactById = new Map(contacts.map((c) => [c.id, c]));

      const jobs: { name: string; data: EmailJobData }[] = [];
      const sendIdsToRequeue: string[] = [];

      // Per-row update with fresh render — re-renders pick up source edits
      // since the original failed send. Inline updates instead of updateMany
      // because each row's bodyHtml is unique.
      const sendUpdates: Promise<unknown>[] = [];

      for (const send of failed) {
        const contact = send.contactId ? contactById.get(send.contactId) : null;
        if (!contact) continue; // contact deleted — leave EmailSend as FAILED

        const firstName = contact.firstName ?? "";
        const lastName = contact.lastName ?? "";
        const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || contact.email;
        const vars = {
          contact: { firstName, lastName, email: contact.email, fullName },
          workspace: { name: workspaceName },
          order: {},
          unsubscribeUrl: buildUnsubscribeUrl(contact.id),
        };
        const subject = render(broadcast.subject, vars);
        const html = await renderEmailContent(broadcast.htmlBody, vars);

        sendIdsToRequeue.push(send.id);
        sendUpdates.push(
          db.emailSend.update({
            where: { id: send.id },
            data: { status: "QUEUED", failedAt: null, errorMessage: null, subject, bodyHtml: html },
          }),
        );
        jobs.push({
          name: "send",
          data: {
            emailSendId: send.id,
            workspaceId,
            contactId: contact.id,
            to: send.toEmail,
            subject,
            html,
            fromEmail: broadcast.fromEmail,
            fromName: broadcast.fromName,
            broadcastId: id,
          },
        });
      }

      if (sendIdsToRequeue.length > 0) {
        await Promise.all(sendUpdates);
        await queue.addBulk(jobs);
        retried += sendIdsToRequeue.length;
      }

      if (failed.length < BATCH_SIZE) break;
    }

    if (retried > 0) {
      await db.broadcast.update({
        where: { id },
        data: { failedCount: { decrement: retried } },
      });
    }

    return ok({ retried });
  } catch (error) {
    return handleError(error);
  }
}
