import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { sendEmail, type SmtpConfig } from "@launchtic/email/server";
import { ok, err } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

const schema = z.object({ sendTo: z.string().email() });

type Params = { params: Promise<{ id: string }> };

// Send a test email "from" the given identity to a recipient address. Uses
// the workspace's SMTP credentials. If the underlying SMTP provider rejects
// the from-address as unauthorized (SES, SendGrid, etc.), surface the
// provider's error message so the user can verify on their side.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("settings:email:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const { sendTo } = schema.parse(await req.json());

    const identity = await db.senderIdentity.findFirst({ where: { id, workspaceId } });
    if (!identity) return err("Sender identity not found", 404);

    const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
    const smtp = (settings as { smtp?: unknown } | null)?.smtp as Record<string, unknown> | undefined;
    if (!smtp?.host || !smtp?.password) {
      return err("SMTP not configured. Set up SMTP in Settings first.", 400);
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
      fromEmail: identity.email,
      fromName: identity.name,
      subject: `Test from "${identity.name}"`,
      html:
        `<p>This is a test email sent from sender identity:</p>` +
        `<ul><li><strong>Name:</strong> ${escapeHtml(identity.name)}</li>` +
        `<li><strong>Email:</strong> ${escapeHtml(identity.email)}</li></ul>` +
        `<p style="color:#666;font-size:13px">If your SMTP provider (SES, SendGrid, etc.) is configured to authorize this address, you'll receive this message. Otherwise, the provider would have rejected it before delivery.</p>`,
    });

    return ok({ sent: true });
  } catch (error: any) {
    // Surface provider-side rejection clearly. Common cases:
    //   • SES: "Email address is not verified"
    //   • SendGrid: "The from address does not match a verified Sender Identity"
    //   • Gmail: "Sender address rejected: not owned by user"
    const msg = error?.message ?? "Failed to send test email";
    return err(msg, 500);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
