import { NextRequest } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db } from "@launchtic/database";
import { ok, err } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { demoGuard } from "../../../../../lib/demo";
import { buildDriver } from "../../../../../lib/storage";

// POST /api/settings/storage/test
// Owner-only. Probes a storage config end-to-end:
//   - upload a tiny throwaway file
//   - delete it
// If both succeed, the config is valid. Used by the StoragePanel "Test
// connection" button so users can verify credentials before saving.
//
// Body shape (all optional):
//   { driver, endpoint, region, bucket, accessKey, secretKey, publicUrl }
// When body is empty the saved org config is tested instead. When a body is
// provided the values are used as-is — no DB write. Lets users iterate on
// credentials without polluting Organization.storage.

const testBody = z.object({
  driver:    z.enum(["local", "s3"]).optional(),
  endpoint:  z.string().optional(),
  region:    z.string().optional(),
  bucket:    z.string().optional(),
  accessKey: z.string().optional(),
  secretKey: z.string().optional(),
  publicUrl: z.string().optional(),
}).optional();

const KEEP = "__KEEP__";

export async function POST(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId, isOwner } = r;
    if (!isOwner) return err("Only the organization owner can test storage", 403);

    // Parse body. Empty body = test saved config.
    let input: z.infer<typeof testBody> = undefined;
    try {
      const raw = await req.json();
      input = testBody.parse(raw);
    } catch { /* no body → test saved */ }

    let cfg: Record<string, any> = {};
    if (input && input.driver) {
      cfg = { ...input };
      // If client kept the masked secret, fall back to the saved one.
      if (cfg.secretKey === KEEP || !cfg.secretKey) {
        const saved = await loadSavedConfig(workspaceId);
        if (saved) cfg.secretKey = saved.secretKey;
      }
    } else {
      const saved = await loadSavedConfig(workspaceId);
      if (!saved) return err("No storage config saved yet — fill the form and click Test.", 400);
      cfg = saved;
    }

    const driver = buildDriver(cfg);
    const probeKey = `__probe__/${workspaceId}/${Date.now()}-${randomBytes(4).toString("hex")}.txt`;
    const probeBuf = Buffer.from("launchtic-storage-probe");

    const startedAt = Date.now();
    let uploadedUrl: string | null = null;
    try {
      uploadedUrl = await driver.upload(probeKey, probeBuf, "text/plain");
    } catch (e: any) {
      return ok({
        success: false,
        stage:   "upload",
        message: e?.message ?? "Upload failed",
      });
    }

    try {
      await driver.delete(probeKey);
    } catch (e: any) {
      // Upload worked but delete failed — partial success. Still report as
      // failure so the user fixes permissions (or cleans up the probe file).
      return ok({
        success:    false,
        stage:      "delete",
        message:    `Uploaded OK but delete failed: ${e?.message ?? "unknown"}`,
        uploadedUrl,
      });
    }

    return ok({
      success:   true,
      stage:     "complete",
      message:   `Connection OK (${cfg.driver ?? "local"}). Round-trip in ${Date.now() - startedAt}ms.`,
      durationMs: Date.now() - startedAt,
    });
  } catch (error: any) {
    console.error("[storage/test]", error);
    return err(error?.message ?? "Test failed", 500);
  }
}

async function loadSavedConfig(workspaceId: string) {
  const ws = await db.workspace.findUnique({
    where:  { id: workspaceId },
    select: { organization: { select: { storage: true } } },
  });
  return (ws?.organization?.storage as any) ?? null;
}
