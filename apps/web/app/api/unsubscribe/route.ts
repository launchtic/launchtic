import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { verifyUnsubscribeToken } from "@launchtic/email/server";

// Public, unauthenticated. Anyone with a signed token can unsubscribe the
// referenced contact — that's the whole point. No rate limit needed: a stolen
// token only lets the attacker unsubscribe one contact, which is exactly what
// the contact themselves can do; there's no privilege escalation.
//
// CAN-SPAM compliance: works without auth, single click acts immediately.
//
// Email clients sometimes pre-fetch links (Outlook Safe Links, antivirus,
// proxy scanners) — that would trigger an unintended unsubscribe on GET. The
// proper fix is RFC 8058 List-Unsubscribe-Post (one-click POST), which we'll
// add later. For MVP, we accept the pre-fetch risk; the only consequence is
// the contact getting unsubscribed slightly earlier than intended.

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return htmlError("Missing token", 400);

  const contactId = verifyUnsubscribeToken(token);
  if (!contactId) return htmlError("Invalid or tampered unsubscribe link.", 400);

  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { id: true, email: true, workspaceId: true, unsubscribedAt: true },
  });
  if (!contact) return htmlError("This contact no longer exists.", 404);

  // Idempotent — clicking twice is fine, second click just shows the same page.
  if (!contact.unsubscribedAt) {
    await db.contact.update({
      where: { id: contact.id },
      data: { unsubscribedAt: new Date() },
    });
    // Timeline event for audit / compliance evidence. IP+UA captured for
    // record but kept best-effort (header parsing varies behind proxies).
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const userAgent = req.headers.get("user-agent") || null;
    await db.contactEvent.create({
      data: {
        contactId: contact.id,
        type: "EMAIL_UNSUBSCRIBED",
        ip,
        userAgent,
      },
    }).catch(() => {});
    // Best-effort exit of every active WorkflowRun this contact is in — so
    // stats reflect immediately and SEND_EMAIL nodes don't fire after the
    // contact unsubscribed. The next scheduled node would skip them anyway
    // via the compliance gate, so this is just optimistic cleanup.
    await db.workflowRun.updateMany({
      where: { contactId: contact.id, workspaceId: contact.workspaceId, status: "ACTIVE" },
      data:  {
        status:      "EXITED",
        exitReason:  "unsubscribed",
        completedAt: new Date(),
        currentNodeId: null,
        scheduledFor:  null,
      },
    }).catch(() => {});
  }

  return htmlPage(`
    <h1 style="margin:0 0 12px;font-size:22px;color:#111">You've been unsubscribed</h1>
    <p style="margin:0;color:#555;font-size:15px;line-height:1.5">
      <strong>${escape(contact.email)}</strong> will no longer receive emails from us.
    </p>
    <p style="margin:18px 0 0;color:#888;font-size:13px">
      Changed your mind? Just contact us — we'll be happy to re-subscribe you.
    </p>
  `);
}

// ─── Render helpers ─────────────────────────────────────────────────────────

function htmlPage(body: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribe</title>
<style>
  body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
         background: #f7f7f8; margin: 0; padding: 0;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .card { background: #fff; border-radius: 16px; padding: 40px 32px; max-width: 480px; width: 90%;
          box-shadow: 0 10px 40px rgba(0,0,0,.06); text-align: center; }
</style>
</head><body><div class="card">${body}</div></body></html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

function htmlError(msg: string, status: number): Response {
  return htmlPage(`
    <h1 style="margin:0 0 12px;font-size:20px;color:#b91c1c">Unsubscribe failed</h1>
    <p style="margin:0;color:#555;font-size:14px;line-height:1.5">${escape(msg)}</p>
  `, status);
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
