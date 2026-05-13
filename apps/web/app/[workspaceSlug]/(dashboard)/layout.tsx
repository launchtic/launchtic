import { auth } from "../../../lib/auth";
import { redirect } from "next/navigation";
import TopNav from "../../../components/TopNav";
import { ConfirmProvider } from "../../../components/ui/ConfirmDialog";
import { ToastProvider } from "../../../components/ui/Toast";
import { UnsavedChangesProvider } from "../../../contexts/UnsavedChangesContext";
import AssistantWidget from "../../../components/ai/AssistantWidget";
import NextTopLoader from "nextjs-toploader";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { workspaceSlug } = await params;
  const workspaceName = ((session as any).workspaceName as string | null) ?? workspaceSlug;

  const fullName = session.user?.name ?? session.user?.email ?? "User";
  const initials = fullName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <ConfirmProvider>
      <ToastProvider>
        <UnsavedChangesProvider>
          <NextTopLoader color="#2563eb" height={3} showSpinner={false} />
          <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
            <TopNav
              name={fullName}
              email={session.user?.email ?? ""}
              initials={initials}
              workspaceSlug={workspaceSlug}
              workspaceName={workspaceName}
            />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
          <AssistantWidget />
        </UnsavedChangesProvider>
      </ToastProvider>
    </ConfirmProvider>
  );
}
