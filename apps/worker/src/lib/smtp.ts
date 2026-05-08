import { db } from "@launchtic/database";
import type { SmtpConfig } from "@launchtic/email/server";

// Loads decrypted SMTP config for a workspace.
// Returns null if SMTP not configured — caller decides how to fail the job.
export async function loadWorkspaceSmtp(workspaceId: string): Promise<SmtpConfig | null> {
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
  const smtp = (settings as { smtp?: unknown } | null)?.smtp as Record<string, unknown> | undefined;
  if (!smtp || !smtp.host || !smtp.passwordEnc) return null;

  return {
    provider: String(smtp.provider ?? "CUSTOM"),
    host: String(smtp.host),
    port: Number(smtp.port ?? 587),
    username: String(smtp.username ?? ""),
    passwordEnc: String(smtp.passwordEnc),
    maxPerDay: smtp.maxPerDay ? Number(smtp.maxPerDay) : undefined,
    maxPerSecond: smtp.maxPerSecond ? Number(smtp.maxPerSecond) : undefined,
    maxConcurrent: smtp.maxConcurrent ? Number(smtp.maxConcurrent) : undefined,
  };
}
