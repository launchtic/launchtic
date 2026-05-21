import { db } from "@launchtic/database";
import SettingsClient from "../../../../components/settings/SettingsClient";
import { decrypt } from "../../../../lib/crypto";
import { ensureDefaultDomain } from "../../../../lib/domains/default-domain";
import { requireWorkspaceFromSlug } from "../../../../lib/permissions";
import { getEffectivePlan } from "../../../../lib/organization";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const { workspaceId, userId } = await requireWorkspaceFromSlug(workspaceSlug);

  // Lazy-seed PAGES_DOMAIN as the workspace's default Domain on first visit.
  await ensureDefaultDomain(workspaceId);

  const [user, workspaceWithOrg, domains, settings, senderIdentities, workspaces, teamMembers, currentMember] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: { organization: { select: { plan: true, licenseExpiresAt: true } } },
    }),
    db.domain.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    db.workspaceSettings.findUnique({ where: { workspaceId } }),
    db.senderIdentity.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, email: true, isDefault: true },
    }),
    db.workspace.findMany({
      where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      select: {
        id: true, name: true, slug: true, ownerId: true,
        members: { where: { userId }, select: { role: true }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    }),
  ]);

  const stripe  = settings?.stripe  as any;
  const paypal  = settings?.paypal  as any;
  const smtp    = settings?.smtp    as any;
  const storage = settings?.storage as any;

  const rendererUrl  = process.env.RENDERER_URL!;
  const rendererHost = new URL(rendererUrl).host;
  const workspacePlan   = getEffectivePlan(workspaceWithOrg?.organization);
  const userName        = user?.name  ?? "";
  const userEmail       = user?.email ?? "";
  const currentUserRole = currentMember?.role ?? "OWNER";

  return (
        <SettingsClient
          rendererUrl={rendererUrl}
          rendererHost={rendererHost}
          currentWorkspaceId={workspaceId}
          currentWorkspaceSlug={workspaceSlug}
          workspacePlan={workspacePlan}
          userId={userId}
          workspaces={workspaces.map((w) => ({ ...w, userRole: w.members[0]?.role ?? "OWNER" }))}
          userName={userName}
          userEmail={userEmail}
          currentUserRole={currentUserRole}
          teamMembers={teamMembers.map((m) => ({
            userId:   m.userId,
            role:     m.role,
            joinedAt: m.joinedAt.toISOString(),
            user: {
              id:     m.user.id,
              name:   m.user.name,
              email:  m.user.email,
              avatar: m.user.avatar,
            },
          }))}
          domains={domains.map((d) => ({
            id: d.id,
            domain: d.domain,
            verified: d.verified,
            isDefault: d.isDefault,
            createdAt: d.createdAt.toISOString(),
          }))}
          stripe={stripe ? {
            publishableKey: stripe.publishableKey ?? "",
            secretKey:      stripe.secretKey ?? "",
            webhookSecret:  stripe.webhookSecret ?? null,
            mode:           stripe.mode ?? "test",
          } : null}
          paypal={paypal ? {
            clientId:     paypal.clientId ?? "",
            clientSecret: paypal.clientSecret ?? "",
            webhookId:    paypal.webhookId ?? null,
            mode:         paypal.mode ?? "sandbox",
          } : null}
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
          storage={storage ? {
            driver:    storage.driver ?? "local",
            endpoint:  storage.endpoint  ?? "",
            region:    storage.region    ?? "",
            bucket:    storage.bucket    ?? "",
            accessKey: storage.accessKey ?? "",
            secretKey: storage.secretKeyEnc ? maskKey(safeDecrypt(storage.secretKeyEnc)) : "",
            publicUrl: storage.publicUrl  ?? "",
          } : null}
          senderIdentities={senderIdentities}
        />
  );
}

function maskKey(key: string): string {
  if (!key || key.length <= 8) return "••••••••";
  return key.slice(0, 8) + "••••••••" + key.slice(-4);
}

function safeDecrypt(enc: string): string {
  if (!enc) return "";
  try { return decrypt(enc); } catch { return ""; }
}
