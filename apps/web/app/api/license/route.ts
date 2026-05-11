import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError, getWorkspaceId } from "../../../lib/api";

const activateSchema = z.object({
  licenseKey: z.string().min(10),
});

// POST /api/license — activate a license key
export async function POST(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const body = await req.json();
    const { licenseKey } = activateSchema.parse(body);

    // Verify with Launchtic license server
    const result = await verifyLicenseKey(licenseKey, workspaceId);
    if (!result.valid) return err(result.error ?? "Invalid license key.", 400);

    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        plan: result.plan as any,
        licenseKey,
        licenseExpiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
      },
    });

    return ok({ plan: result.plan, expiresAt: result.expiresAt ?? null });
  } catch (error) {
    return handleError(error);
  }
}

// GET /api/license — get current license status
export async function GET() {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { plan: true, licenseKey: true, licenseExpiresAt: true },
    });

    if (!workspace) return err("Workspace not found", 404);

    const isExpired =
      workspace.licenseExpiresAt != null &&
      workspace.licenseExpiresAt < new Date();

    return ok({
      plan: isExpired ? "FREE" : workspace.plan,
      licenseKey: workspace.licenseKey
        ? maskKey(workspace.licenseKey)
        : null,
      expiresAt: workspace.licenseExpiresAt?.toISOString() ?? null,
      isExpired,
    });
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/license — remove license key (downgrade to FREE)
export async function DELETE() {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    await db.workspace.update({
      where: { id: workspaceId },
      data: { plan: "FREE", licenseKey: null, licenseExpiresAt: null },
    });

    return ok({ plan: "FREE" });
  } catch (error) {
    return handleError(error);
  }
}

async function verifyLicenseKey(
  key: string,
  workspaceId: string,
): Promise<{ valid: boolean; plan?: string; expiresAt?: string; error?: string }> {
  const serverUrl = process.env.LICENSE_SERVER_URL ?? "https://launchtic.com";

  try {
    const res = await fetch(`${serverUrl}/api/licenses/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, workspaceId }),
      // 10s timeout so a slow server doesn't block the UI
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json();
    return data;
  } catch {
    // If the license server is unreachable, fall back to offline format check
    // so self-hosters aren't locked out by a network blip
    if (key.startsWith("LT-PRO-")) return { valid: true, plan: "PRO" };
    if (key.startsWith("LT-ENT-")) return { valid: true, plan: "ENTERPRISE" };
    return { valid: false, error: "Could not reach license server." };
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••••••" + key.slice(-4);
}
