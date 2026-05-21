// Password reset helpers — token generation/hashing + SMTP resolution.
//
// Token strategy:
//   - Raw token: 32 random bytes hex-encoded (64 chars, ~256 bits entropy)
//   - Storage:   SHA-256(raw) so a DB leak doesn't expose live tokens
//   - Lifetime:  1h from creation
//   - Single-use: usedAt is set on successful reset
//
// SMTP resolution priority (Case 1 + Case 2 — Case 3 "no SMTP at all" is
// deferred and handled by returning null + a generic success response):
//   1. First OWNED workspace with both SMTP config + a sender identity
//   2. First MEMBER workspace with both
// Email content is GENERIC (no workspace name) since the user may belong
// to several — we don't want to imply the email is "from" one specific
// workspace.

import { createHash, randomBytes } from "node:crypto";
import { db } from "@launchtic/database";
import type { SmtpConfig } from "@launchtic/email/server";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export function generateResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashResetToken(raw) };
}

export function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type ResetEmailSender = {
  smtp:      SmtpConfig;
  fromEmail: string;
  fromName:  string;
};

// Returns null if no workspace the user belongs to has both SMTP + a sender
// identity. Caller should silently log this and still return a generic
// success response to the user (Case 3 fallback handled later).
export async function resolveResetEmailSender(userId: string): Promise<ResetEmailSender | null> {
  // Tier 1: first OWNED workspace with SMTP + ≥1 sender identity
  const owned = await db.workspace.findFirst({
    where: {
      ownerId: userId,
      settings: { smtp: { not: undefined } },
      senderIdentities: { some: {} },
    },
    select: {
      settings: { select: { smtp: true } },
      senderIdentities: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        take: 1,
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const ownedSender = pickSender(owned);
  if (ownedSender) return ownedSender;

  // Tier 2: first MEMBER workspace (not owned) with SMTP + ≥1 sender identity
  const member = await db.workspaceMember.findFirst({
    where: {
      userId,
      workspace: {
        settings: { smtp: { not: undefined } },
        senderIdentities: { some: {} },
        ownerId: { not: userId }, // exclude owned (already checked above)
      },
    },
    select: {
      workspace: {
        select: {
          settings: { select: { smtp: true } },
          senderIdentities: {
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { name: true, email: true },
          },
        },
      },
    },
    orderBy: { workspace: { createdAt: "asc" } },
  });
  return pickSender(member?.workspace);
}

function pickSender(
  ws: { settings: { smtp: unknown } | null; senderIdentities: { name: string; email: string }[] } | null | undefined,
): ResetEmailSender | null {
  if (!ws?.settings?.smtp) return null;
  const smtp = ws.settings.smtp as SmtpConfig;
  if (!smtp.host) return null;
  const sender = ws.senderIdentities[0];
  if (!sender) return null;
  return {
    smtp,
    fromEmail: sender.email,
    // Always "Launchtic" — never the workspace name. Account-level email,
    // not a workspace email, so workspace branding would be misleading.
    fromName: "Launchtic",
  };
}

// Build the password reset email HTML. Kept minimal + inline-styled so it
// renders consistently across clients without external CSS.
export function buildResetEmailHtml(opts: {
  email:     string;
  resetUrl:  string;
  expiresIn: string; // human-readable, e.g. "1 hour"
}): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;background:#f9fafb;color:#111827;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
    <tr><td style="padding:32px;">
      <h1 style="font-size:18px;font-weight:600;color:#111827;margin:0 0 16px;">Reset your Launchtic password</h1>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px;">
        Someone requested a password reset for your Launchtic account
        (<strong>${escapeHtml(opts.email)}</strong>).
      </p>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 24px;">
        Click the button below to set a new password. This link expires in ${escapeHtml(opts.expiresIn)}.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
        <tr><td style="background:#2563eb;border-radius:8px;">
          <a href="${escapeHtml(opts.resetUrl)}" style="display:inline-block;padding:10px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">
            Reset password
          </a>
        </td></tr>
      </table>
      <p style="font-size:13px;line-height:1.5;color:#6b7280;margin:0 0 8px;">
        If the button doesn't work, copy and paste this URL into your browser:
      </p>
      <p style="font-size:12px;line-height:1.5;color:#6b7280;word-break:break-all;margin:0 0 24px;">
        ${escapeHtml(opts.resetUrl)}
      </p>
      <p style="font-size:13px;line-height:1.5;color:#9ca3af;margin:0;border-top:1px solid #f3f4f6;padding-top:16px;">
        If you didn't request this, ignore this email — your password stays the same.
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
