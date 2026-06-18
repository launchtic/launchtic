import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { sendEmail, render, sampleVars, renderEmailContent, type SmtpConfig } from "@launchtic/email/server";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { getAppUrl } from "../../../../../lib/system-config";

const schema = z.object({ sendTo: z.string().email() });

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("email_templates:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const { sendTo } = schema.parse(await req.json());

    const [template, settings, workspace, sender] = await Promise.all([
      db.emailTemplate.findFirst({ where: { id, workspaceId } }),
      db.workspaceSettings.findUnique({ where: { workspaceId } }),
      db.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
      }),
      db.senderIdentity.findFirst({
        where: { workspaceId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { name: true, email: true },
      }),
    ]);
    if (!template) return err("Template not found", 404);
    if (!sender) return err("Add a Sender Identity in Settings before sending.", 400);

    const smtpRaw = (settings as { smtp?: unknown } | null)?.smtp as Record<string, unknown> | undefined;
    if (!smtpRaw?.host || !smtpRaw?.password) return err("SMTP not configured", 400);

    const smtp: SmtpConfig = {
      provider: String(smtpRaw.provider ?? "CUSTOM"),
      host: String(smtpRaw.host),
      port: Number(smtpRaw.port ?? 587),
      username: String(smtpRaw.username ?? ""),
      password: String(smtpRaw.password),
    };

    const workspaceName = workspace?.name ?? "Your Workspace";
    const vars = { ...sampleVars(), workspace: { name: workspaceName } };
    const subject = render(template.subject, vars);
    const html = await renderEmailContent(template.htmlBody, vars, await getAppUrl());

    await sendEmail(smtp, {
      to: sendTo,
      subject,
      html,
      fromEmail: sender.email,
      fromName: sender.name,
    });
    return ok({ sent: true });
  } catch (error) {
    return handleError(error);
  }
}
