import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

// Storage config lives on Organization (single bucket shared by every
// workspace under the org; files isolated via {workspaceId}/... path prefix).
// Owner-only writes. Secret key stored plaintext to match the stripe /
// ai.apiKey pattern elsewhere in the codebase.

const KEEP = "__KEEP__";

const bodySchema = z.object({
  driver:    z.enum(["local", "s3"]),
  endpoint:  z.string().optional(),
  region:    z.string().optional(),
  bucket:    z.string().optional(),
  accessKey: z.string().optional(),
  secretKey: z.string().optional(),
  publicUrl: z.string().optional(),
});

async function resolveOrgId(workspaceId: string): Promise<string | null> {
  const ws = await db.workspace.findUnique({
    where:  { id: workspaceId },
    select: { organizationId: true },
  });
  return ws?.organizationId ?? null;
}

export async function GET() {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId, isOwner } = r;
    if (!isOwner) return err("Owner-only", 403);

    const orgId = await resolveOrgId(workspaceId);
    if (!orgId) return err("Organization not found", 404);

    const org = await db.organization.findUnique({
      where:  { id: orgId },
      select: { storage: true },
    });
    const s = org?.storage as any;

    return ok({
      driver:    s?.driver    ?? "local",
      endpoint:  s?.endpoint  ?? "",
      region:    s?.region    ?? "",
      bucket:    s?.bucket    ?? "",
      accessKey: s?.accessKey ?? "",
      // Plaintext — owner-only endpoint. UI hides via password input + eye
      // toggle. Same pattern as Stripe/AI key settings.
      secretKey: s?.secretKey ?? "",
      publicUrl: s?.publicUrl ?? "",
    });
  } catch (error) {
    console.error(error);
    return err("Failed to load storage config", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId, isOwner } = r;

    // Org-wide config — only the org owner may change it.
    if (!isOwner) return err("Only the organization owner can change storage", 403);

    const orgId = await resolveOrgId(workspaceId);
    if (!orgId) return err("Organization not found", 404);

    const body = bodySchema.parse(await req.json());

    const org = await db.organization.findUnique({
      where:  { id: orgId },
      select: { storage: true },
    });
    const existing = org?.storage as any;

    let secretKey: string | null = existing?.secretKey ?? null;
    if (body.secretKey && body.secretKey !== KEEP) {
      secretKey = body.secretKey;
    }

    const storageData = {
      driver:    body.driver,
      endpoint:  body.endpoint  || null,
      region:    body.region    || null,
      bucket:    body.bucket    || null,
      accessKey: body.accessKey || null,
      secretKey,
      publicUrl: body.publicUrl || null,
    };

    await db.organization.update({
      where: { id: orgId },
      data:  { storage: storageData },
    });

    return ok({ driver: body.driver });
  } catch (error) {
    console.error(error);
    return err("Failed to save storage config", 500);
  }
}
