// Workspace-level email footer config — applied by all 3 workers
// (broadcast/sequence/automation) above the auto-injected unsubscribe link.
//
// Stored in WorkspaceSettings.emailFooter as JSON blob (no migration needed).

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";

type Footer = { unsubscribeText: string | null; physicalAddress: string | null };

const updateSchema = z.object({
  unsubscribeText: z.string().max(500).nullable().optional(),
  physicalAddress: z.string().max(500).nullable().optional(),
});

async function read(workspaceId: string): Promise<Footer> {
  const settings = await db.workspaceSettings.findUnique({
    where: { workspaceId },
    select: { emailFooter: true },
  });
  const f = (settings?.emailFooter as Partial<Footer> | null) ?? null;
  return {
    unsubscribeText: f?.unsubscribeText?.trim() || null,
    physicalAddress: f?.physicalAddress?.trim() || null,
  };
}

export async function GET() {
  try {
    const r = await requireAccess("settings:email:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;
    return ok(await read(workspaceId));
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const r = await requireAccess("settings:email:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const data = updateSchema.parse(await req.json());

    // Merge with existing — caller can update one field without resetting the other
    const existing = await read(workspaceId);
    const next: Footer = {
      unsubscribeText: data.unsubscribeText !== undefined ? (data.unsubscribeText?.trim() || null) : existing.unsubscribeText,
      physicalAddress: data.physicalAddress !== undefined ? (data.physicalAddress?.trim() || null) : existing.physicalAddress,
    };

    await db.workspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, emailFooter: next as any },
      update: { emailFooter: next as any },
    });

    return ok(next);
  } catch (error) {
    return handleError(error);
  }
}
