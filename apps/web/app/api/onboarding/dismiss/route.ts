import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

// POST /api/onboarding/dismiss
// Marks the onboarding checklist as dismissed for the caller's workspace.
// Idempotent: upserts WorkspaceSettings so the row exists even on a fresh
// workspace that never opened Settings.

export async function POST(_req: NextRequest) {
  try {
    const r = await requireAccess("settings:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    await db.workspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, onboardingDismissed: true },
      update: { onboardingDismissed: true },
    });

    return ok({ dismissed: true });
  } catch (error) {
    return handleError(error);
  }
}
