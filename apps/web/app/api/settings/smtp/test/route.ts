import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { demoGuard } from "../../../../../lib/demo";
import { db } from "@launchtic/database";
import { sendEmail, type SmtpConfig } from "@launchtic/email/server";

const schema = z.object({ sendTo: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("settings:email:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { sendTo } = schema.parse(await req.json());

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const smtp = (settings as { smtp?: unknown } | null)?.smtp as Record<string, unknown> | undefined;
    if (!smtp?.host || !smtp?.password) return err("SMTP not configured", 400);

    // Pick the workspace's default Sender Identity for the From address. SMTP
    // no longer carries a sender, so we need at least one identity to test.
    const sender = await db.senderIdentity.findFirst({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { name: true, email: true },
    });
    if (!sender) {
      return err("Add a Sender Identity in Settings before testing SMTP.", 400);
    }

    const config: SmtpConfig = {
      provider: String(smtp.provider ?? "CUSTOM"),
      host: String(smtp.host),
      port: Number(smtp.port ?? 587),
      username: String(smtp.username ?? ""),
      password: String(smtp.password),
    };

    await sendEmail(config, {
      to: sendTo,
      fromEmail: sender.email,
      fromName: sender.name,
      subject: "SMTP Test — Connection successful",
      html: "<p>Your SMTP configuration is working correctly.</p>",
    });

    return ok({ sent: true });
  } catch (error: any) {
    return err(error?.message ?? "Failed to send test email", 500);
  }
}
