// Workspace-scoped email footer config — used by broadcast/sequence/automation
// workers to inject a consistent footer block (custom text + physical address
// + unsubscribe link) into outgoing marketing emails.
//
// Centralized here so a single workspace setting shapes every send across
// all three workers — no per-email copy, no drift.

import { db } from "@launchtic/database";
import { shouldShowLaunchticBadge, type RenderOptions } from "@launchtic/email/server";

export type WorkspaceFooterConfig = {
  unsubscribeText: string | null;
  physicalAddress: string | null;
};

/** Load workspace-level footer settings. Returns nulls if not configured. */
export async function loadWorkspaceFooter(workspaceId: string): Promise<WorkspaceFooterConfig> {
  const settings = await db.workspaceSettings.findUnique({
    where: { workspaceId },
    select: { emailFooter: true },
  });
  const footer = (settings?.emailFooter as { unsubscribeText?: string; physicalAddress?: string } | null) ?? null;
  return {
    unsubscribeText: footer?.unsubscribeText?.trim() || null,
    physicalAddress: footer?.physicalAddress?.trim() || null,
  };
}

/** Build RenderOptions for marketing email render — always appends unsubscribe. */
export async function marketingRenderOptions(workspaceId: string): Promise<RenderOptions> {
  const [footer, workspace] = await Promise.all([
    loadWorkspaceFooter(workspaceId),
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner: { select: { plan: true, licenseExpiresAt: true } } },
    }),
  ]);
  return {
    appendUnsubscribe: true,
    unsubscribeText: footer.unsubscribeText,
    physicalAddress: footer.physicalAddress,
    appendPoweredByBadge: shouldShowLaunchticBadge(
      workspace?.owner?.plan,
      workspace?.owner?.licenseExpiresAt,
    ),
  };
}
