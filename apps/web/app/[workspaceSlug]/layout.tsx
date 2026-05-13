export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  // Workspace validation will be added when multi-workspace is implemented.
  // For now, just render children — access is enforced by the dashboard layout's
  // auth check and the fact that session.workspaceId is locked to the user's workspace.
  return <>{children}</>;
}
