import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { verifyLicenseKey } from "../../../lib/license";
import { demoGuard } from "../../../lib/demo";

const activateSchema = z.object({
  licenseKey: z.string().min(10),
});

// POST /api/license — activate a license key on the workspace's Organization.
// Owner-only — invited team members get 403 here.
export async function POST(req: NextRequest) {
  try {
    // Block in demo — replacing the demo license would break the sandbox.
    const blocked = demoGuard();
    if (blocked) return blocked;

    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);
    const { organizationId } = r;

    const body = await req.json();
    const { licenseKey } = activateSchema.parse(body);
    if (/^LTP-/i.test(licenseKey.trim())) return err("This is an add-on key — add it in the Add-ons tab.", 400);

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, instanceId: true },
    });
    if (!organization) return err("Organization not found", 404);

    // Stable instanceId per Organization so the license server can detect key
    // sharing across installations.
    const instanceId = organization.instanceId ?? crypto.randomUUID();

    const result = await verifyLicenseKey(licenseKey, instanceId);
    if (!result.valid) return err(result.error ?? "Invalid license key.", 400);

    await db.organization.update({
      where: { id: organization.id },
      data: {
        plan:              result.plan as any,
        licenseKey,
        licenseExpiresAt:  result.expiresAt ? new Date(result.expiresAt) : null,
        licenseVerifiedAt: new Date(),
        instanceId,
      },
    });

    return ok({ plan: result.plan, expiresAt: result.expiresAt ?? null });
  } catch (error) {
    return handleError(error);
  }
}

// GET /api/license — current license status for the workspace's Organization.
// Owner-only — same gate as POST.
export async function GET() {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);
    const { organizationId } = r;

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true, licenseKey: true, licenseExpiresAt: true },
    });
    if (!organization) return err("Organization not found", 404);

    // licenseExpiresAt is the Agency subscription's current paid-through date.
    // reVerifyIfStale (lib/license.ts) is what actually enforces it — nulling
    // the plan out once the subscription lapses — so this is display-only.
    return ok({
      plan: organization.plan,
      licenseKey: organization.licenseKey ? maskKey(organization.licenseKey) : null,
      expiresAt: organization.licenseExpiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    return handleError(error);
  }
}


function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••••••" + key.slice(-4);
}
