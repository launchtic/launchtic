// Lazy-seed the install's PAGES_DOMAIN as the workspace's default Domain.
// Called on every Domain list (SSR + API) but is a no-op once a default exists.
// Race-safe via the partial unique index Domain_workspaceId_isDefault_unique.

import { db } from "@launchtic/database";

const PAGES_DOMAIN = process.env.PAGES_DOMAIN ?? "";

export async function ensureDefaultDomain(workspaceId: string): Promise<void> {
  if (!PAGES_DOMAIN) return;
  const existing = await db.domain.findFirst({
    where: { workspaceId, isDefault: true },
    select: { id: true },
  });
  if (existing) return;
  try {
    await db.domain.upsert({
      where: { domain: PAGES_DOMAIN },
      create: {
        workspaceId,
        domain: PAGES_DOMAIN,
        verified: true,
        isDefault: true,
      },
      update: { verified: true, isDefault: true },
    });
  } catch {
    // P2002 race or domain owned by another workspace — ignore.
  }
}
