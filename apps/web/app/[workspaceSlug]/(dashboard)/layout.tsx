import { auth } from "../../../lib/auth";
import { redirect } from "next/navigation";
import { db } from "@launchtic/database";
import { reVerifyIfStale } from "../../../lib/license";
import { getEffectivePlan } from "../../../lib/organization";
import { requireWorkspaceFromSlug } from "../../../lib/permissions";
import TopNav from "../../../components/TopNav";
import { ConfirmProvider } from "../../../components/ui/ConfirmDialog";
import { ToastProvider } from "../../../components/ui/Toast";
import { UnsavedChangesProvider } from "../../../contexts/UnsavedChangesContext";
import AssistantWidget from "../../../components/ai/AssistantWidget";
import OnboardingChecklist from "../../../components/dashboard/OnboardingChecklist";
import { WorkspaceRoleProvider } from "../../../components/WorkspaceRoleProvider";
import { getOnboardingStatus } from "../../../lib/onboarding";
import NextTopLoader from "nextjs-toploader";

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
  const { workspaceId, userId, role } = await requireWorkspaceFromSlug(workspaceSlug);

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

  const [organization, user, onboarding, workspaces] = await Promise.all([
    db.organization.findUnique({
      where: { id: wsHead.organizationId },
      select: { plan: true, licenseExpiresAt: true },
    }),
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    getOnboardingStatus(workspaceId),
    db.workspace.findMany({
      where: { members: { some: { userId } } },
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
    <WorkspaceRoleProvider role={role}>
    <ConfirmProvider>
      <ToastProvider>
        <UnsavedChangesProvider>
          <NextTopLoader color="#2563eb" height={3} showSpinner={false} />
          <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
            <TopNav
              name={fullName}
              email={user?.email ?? ""}
              initials={initials}
              workspaceSlug={workspaceSlug}
              workspaceName={workspaceName}
              workspacePlan={workspacePlan}
              workspaces={workspaces}
            />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
          {onboarding && !onboarding.isComplete && !onboarding.isDismissed && (
            <OnboardingChecklist status={onboarding} />
          )}
          <AssistantWidget />
        </UnsavedChangesProvider>
      </ToastProvider>
    </ConfirmProvider>
    </WorkspaceRoleProvider>
  );
}
