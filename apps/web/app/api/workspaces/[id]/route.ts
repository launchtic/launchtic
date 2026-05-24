import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";
import { getDriver, getDriverName, LocalDriver, type StorageDriver } from "../../../../lib/storage";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Slug may only contain lowercase letters, numbers, and hyphens.",
  }).optional(),
}).refine((d) => d.name || d.slug, { message: "Provide at least name or slug." });

// PATCH /api/workspaces/[id] — update name and/or slug (owner only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { userId } = r;

    const { id } = await params;
    const workspace = await db.workspace.findUnique({ where: { id }, select: { ownerId: true } });
    if (!workspace)                   return err("Workspace not found", 404);
    if (workspace.ownerId !== userId) return err("Only the owner can update this workspace", 403);

    const body = updateSchema.parse(await req.json());
    const updated = await db.workspace.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.slug && { slug: body.slug }),
      },
      select: { id: true, name: true, slug: true },
    });

    return ok(updated);
  } catch (error) {
    return handleError(error, { "slug": "This slug is already taken." });
  }
}

// DELETE /api/workspaces/[id] — delete workspace (owner only, not last workspace)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { userId } = r;

    const { id } = await params;
    const workspace = await db.workspace.findUnique({ where: { id }, select: { ownerId: true } });
    if (!workspace)                   return err("Workspace not found", 404);
    if (workspace.ownerId !== userId) return err("Only the owner can delete this workspace", 403);

    // Prevent deleting the user's last workspace.
    const count = await db.workspace.count({ where: { ownerId: userId } });
    if (count <= 1) return err("You cannot delete your only workspace.", 400);

    // ── Purge storage BEFORE the DB cascade ────────────────────────────────
    // Prisma's onDelete: Cascade only wipes Asset rows, not the underlying
    // files on disk / in S3. We must call the driver(s) ourselves, otherwise
    // every deleted workspace leaves orphan files behind forever.
    //
    // Mixed-storage caveat: a workspace can have assets on BOTH local and S3
    // (clone preserves per-asset location). So we wipe local always (no-op
    // if the folder is empty) and S3 too whenever the org currently has S3
    // configured. If the org has dropped its S3 config we can't reach that
    // bucket anymore — those files are the user's responsibility.
    //
    // Best-effort: a storage failure must not block the DB delete, or the
    // user would be stuck with a half-deleted workspace they can't retry.
    await purgeWorkspaceStorage(id).catch((e) => {
      console.error(`[workspace-delete] storage purge failed for ${id}:`, e?.message ?? e);
    });

    await db.workspace.delete({ where: { id } });

    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

async function purgeWorkspaceStorage(workspaceId: string): Promise<void> {
  // 1. Always wipe the local folder (no-op via rm force:true if missing).
  await safePurge(workspaceId, "local", async () => new LocalDriver());

  // 2. If org currently has S3, wipe its prefix too. Skipped when org is on
  //    local-only — there's no S3 driver to instantiate. getDriver may throw
  //    if S3 config is partial, hence the factory-style callback inside the
  //    try block.
  const driverName = await getDriverName(workspaceId).catch(() => "local");
  if (driverName === "s3") {
    await safePurge(workspaceId, "s3", () => getDriver(workspaceId));
  }
}

async function safePurge(
  workspaceId: string,
  label: string,
  factory: () => Promise<StorageDriver>,
): Promise<void> {
  try {
    const driver = await factory();
    await driver.purge(workspaceId);
  } catch (e: any) {
    // Log but swallow — caller still proceeds to DB delete.
    console.error(`[workspace-delete] ${label} purge failed for ${workspaceId}:`, e?.message ?? e);
  }
}
