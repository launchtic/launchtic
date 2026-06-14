import { auth } from "../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import { reVerifyIfStale } from "../../../lib/license";
import { getEffectivePlan } from "../../../lib/organization";
import { getActiveBranding } from "../../../lib/branding";
import { requireWorkspaceFromSlug } from "../../../lib/permissions";
import TopNav from "../../../components/TopNav";
import DemoBanner from "../../../components/DemoBanner";
import { ConfirmProvider } from "../../../components/ui/ConfirmDialog";
import { ToastProvider } from "../../../components/ui/Toast";
import { UnsavedChangesProvider } from "../../../contexts/UnsavedChangesContext";
import AssistantWidget from "../../../components/ai/AssistantWidget";
import OnboardingChecklist from "../../../components/dashboard/OnboardingChecklist";
import { WorkspaceRoleProvider } from "../../../components/WorkspaceRoleProvider";
import { getOnboardingStatus } from "../../../lib/onboarding";
import NextTopLoader from "nextjs-toploader";

// Note: favicon + brand title come from the ROOT layout's generateMetadata
// (apps/web/app/layout.tsx). Self-host has one Organization per install,
// so a single resolve in root covers every page including this one. No
// per-segment metadata override needed today.

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { workspaceSlug } = await params;
  const { workspaceId, userId, role, permissions, isOwner } = await requireWorkspaceFromSlug(workspaceSlug);

  // Need workspace.organizationId before we can re-verify or read plan. Plan
  // now lives on Organization — Workspace just points to its billing parent.
  const wsHead = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, organizationId: true },
  });
  if (!wsHead) redirect("/dashboard");

  // Re-verify the workspace's Organization license in background — no-op if
  // checked within last 24h. Operates on the workspace's Organization, not
  // the viewer's own org — so an invited team member's page load still keeps
  // the host workspace's license fresh.
  await reVerifyIfStale(wsHead.organizationId);

  const [organization, branding, user, onboarding, workspaces] = await Promise.all([
    db.organization.findUnique({
      where: { id: wsHead.organizationId },
      select: { plan: true, licenseExpiresAt: true },
    }),
    // Active branding = saved overrides ONLY when plan + license still grant
    // whiteLabel. Expired Agency / non-Agency → falls back to launchtic
    // defaults automatically (saved JSON stays untouched, returns when
    // license is renewed).
    getActiveBranding(wsHead.organizationId),
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    getOnboardingStatus(workspaceId),
    // Workspaces the user can switch to: workspaces they own via the
    // Organization OR are explicitly invited to. Org owners don't have a
    // WorkspaceMember row (they bypass via Organization.ownerId), so the
    // member-only filter would miss their own workspaces.
    db.workspace.findMany({
      where: {
        OR: [
          { organization: { ownerId: userId } },
          { members: { some: { userId } } },
        ],
      },
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const workspaceName = wsHead.name;
  const workspacePlan = getEffectivePlan(organization);

  const fullName = user?.name ?? user?.email ?? "User";
  const initials = fullName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <WorkspaceRoleProvider role={role} permissions={permissions} isOwner={isOwner}>
    <ConfirmProvider>
      <ToastProvider>
        <UnsavedChangesProvider>
          {/* Favicon + title come from generateMetadata above (server-side,
              injected into <head> by Next). No client effect needed. */}
          <NextTopLoader color="#2563eb" height={3} showSpinner={false} />
          <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
            <DemoBanner />
            <TopNav
              name={fullName}
              email={user?.email ?? ""}
              initials={initials}
              workspaceSlug={workspaceSlug}
              workspaceName={workspaceName}
              workspacePlan={workspacePlan}
              workspaces={workspaces}
              brandName={branding.brandName}
              brandLogoUrl={branding.logoUrl}
            />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
          {/* Onboarding checklist — Owner-only. Every onboarding action
              (configure SMTP / payment / AI / create funnel) requires
              workspace owner permissions; invited members can't act on any
              of these and would just see a checklist they can't complete. */}
          {isOwner && onboarding && !onboarding.isComplete && !onboarding.isDismissed && (
            <OnboardingChecklist status={onboarding} />
          )}
          <AssistantWidget />
        </UnsavedChangesProvider>
      </ToastProvider>
    </ConfirmProvider>
    </WorkspaceRoleProvider>
  );
}
