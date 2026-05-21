// /settings landing — bounce to Profile (the first tab; always accessible
// regardless of permission since it shows user's own data).
//
// Previous monolithic implementation (SettingsClient + tab query param)
// was split into per-tab sub-pages so each can enforce its own permission
// gate and fetch only its own data.

import { redirect } from "next/navigation";

export default async function SettingsIndex({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  redirect(`/${workspaceSlug}/settings/profile`);
}
