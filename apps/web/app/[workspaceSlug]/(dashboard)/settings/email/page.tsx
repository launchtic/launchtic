import { db } from "@launchtic/database";
import { requireWorkspaceFromSlug } from "../../../../../lib/permissions";
import { decrypt } from "../../../../../lib/crypto";
import EmailSettings from "../../../../../components/settings/EmailSettings";

export const metadata = { title: "Email Settings" };

function safeDecrypt(enc: string): string {
  if (!enc) return "";
  try { return decrypt(enc); } catch { return ""; }
}

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspaceId } = await requireWorkspaceFromSlug(workspaceSlug, "settings:email:read");

  const [settings, senderIdentities] = await Promise.all([
    db.workspaceSettings.findUnique({ where: { workspaceId } }),
    db.senderIdentity.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, email: true, isDefault: true },
    }),
  ]);

  const smtp = settings?.smtp as any;

  return (
    <div className="p-6 sm:p-8">
      <EmailSettings
        smtp={smtp ? {
          provider:      smtp.provider ?? "CUSTOM",
          host:          smtp.host ?? "",
          port:          smtp.port ?? 587,
          username:      smtp.username ?? "",
          password:      safeDecrypt(smtp.passwordEnc ?? ""),
          maxPerDay:     smtp.maxPerDay     ?? 10000,
          maxPerSecond:  smtp.maxPerSecond  ?? 1,
          maxConcurrent: smtp.maxConcurrent ?? 1,
        } : null}
        senderIdentities={senderIdentities}
      />
    </div>
  );
}
