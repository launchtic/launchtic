// Lazy-seed the install's pages domain as the workspace's default Domain.
// Called on every Domain list (SSR + API) but is a no-op once a default exists.
// Race-safe via the partial unique index Domain_workspaceId_isDefault_unique.
//
// Pages domain comes from SystemConfig (written by the first-run wizard),
// NOT env vars — the post-wizard refactor moved domain config to DB so
// operators can change it later without redeploying.

import { db } from "@launchtic/database";
import { getPagesDomain } from "../system-config";

export async function ensureDefaultDomain(workspaceId: string): Promise<void> {
  const pagesDomain = await getPagesDomain();
  if (!pagesDomain) return;  // wizard not finished yet — caller will retry
  const existing = await db.domain.findFirst({
    where: { workspaceId, isDefault: true },
    select: { id: true },
  });
  if (existing) return;
  try {
    await db.domain.upsert({
      where: { domain: pagesDomain },
      create: {
        workspaceId,
        domain: pagesDomain,
        verified: true,
        isDefault: true,
      },
      update: { verified: true, isDefault: true },
    });
  } catch {
    // P2002 race or domain owned by another workspace — ignore.
  }
}
