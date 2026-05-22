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
import { renderSystemEmail, esc, type EmailBranding } from "./email-layout";

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
//
// `fromName` is the visible sender name (account-level brand — install's
// brandName when Agency-tier license active, else "launchtic"). The caller
// resolves it via `getInstallationBranding()` and passes through.
export async function resolveResetEmailSender(userId: string, fromName: string): Promise<ResetEmailSender | null> {
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
  const ownedSender = pickSender(owned, fromName);
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
  return pickSender(member?.workspace, fromName);
}

function pickSender(
  ws: { settings: { smtp: unknown } | null; senderIdentities: { name: string; email: string }[] } | null | undefined,
  fromName: string,
): ResetEmailSender | null {
  if (!ws?.settings?.smtp) return null;
  const smtp = ws.settings.smtp as SmtpConfig;
  if (!smtp.host) return null;
  const sender = ws.senderIdentities[0];
  if (!sender) return null;
  return {
    smtp,
    fromEmail: sender.email,
    // Always the install's brand name (Agency-tier override or "launchtic")
    // — never the workspace name. Account-level email, not a workspace
    // email; workspace branding would mislead.
    fromName,
  };
}

// Build the password reset email HTML. Uses the shared system-email layout
// so this matches the look + branding of other system emails (welcome,
// team invite, etc. as those get added).
export function buildResetEmailHtml(opts: {
  email:     string;
  resetUrl:  string;
  expiresIn: string;        // human-readable, e.g. "1 hour"
  brand:     EmailBranding; // brandName + absolute logoUrl (caller resolves)
}): string {
  const intro = `Someone requested a password reset for your <strong>${esc(opts.brand.brandName)}</strong> account (${esc(opts.email)}). Click the button below to set a new password — this link expires in ${esc(opts.expiresIn)}.`;

  const bodyHtml = `
    <!-- Fallback URL block for clients that block CTA buttons -->
    <p style="margin:24px 0 8px;font-size:13px;line-height:1.5;color:#64748b;">
      If the button doesn't work, copy and paste this URL into your browser:
    </p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all;font-family:monospace;">
      ${esc(opts.resetUrl)}
    </p>
  `;

  return renderSystemEmail({
    brand:      opts.brand,
    preheader:  `Reset your ${opts.brand.brandName} password — link expires in ${opts.expiresIn}.`,
    title:      `Reset your ${opts.brand.brandName} password`,
    intro,
    bodyHtml,
    cta:        { label: "Reset password", url: opts.resetUrl },
    footerNote: "If you didn't request this, ignore this email — your password stays the same.",
  });
}
