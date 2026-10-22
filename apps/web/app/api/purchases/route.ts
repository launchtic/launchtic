import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { demoGuard } from "../../../lib/demo";
import { fetchProductFiles, instanceIdFor } from "../../../lib/products";

export const dynamic = "force-dynamic";

// GET /api/purchases — every saved product key with its current file list.
// Keys are per Organization, so every workspace shows the same list; the
// workspace name tells the user where an install will land.
// A key the server rejects (revoked, used elsewhere) still shows, with its error.
export async function GET() {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);

    const org = await db.organization.findUnique({
      where: { id: r.organizationId },
      select: { productKeys: true },
    });
    const instanceId = await instanceIdFor(r.organizationId);
    const purchases = await Promise.all(
      (org?.productKeys ?? []).map(async (key) => {
        try {
          return { key, ...(await fetchProductFiles(key, instanceId)) };
        } catch (e: any) {
          return { key, error: e?.message ?? "Could not load" };
        }
      }),
    );
    const ws = await db.workspace.findUnique({ where: { id: r.workspaceId }, select: { name: true } });
    return ok({ workspace: ws?.name ?? "", purchases });
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/purchases { key } — verify with the license server, then save.
export async function POST(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);

    const body = await req.json().catch(() => ({}));
    const key = typeof body.key === "string" ? body.key.trim().toUpperCase() : "";
    if (!key) return err("Enter an add-on key", 400);
    if (key.startsWith("LT-")) return err("This is a license key — enter it in the Plan tab.", 400);

    let listing;
    try {
      listing = await fetchProductFiles(key, await instanceIdFor(r.organizationId));
    } catch (e: any) {
      return err(e?.message ?? "Invalid key", 400);
    }

    const org = await db.organization.findUnique({
      where: { id: r.organizationId },
      select: { productKeys: true },
    });
    if (!org?.productKeys.includes(key)) {
      await db.organization.update({
        where: { id: r.organizationId },
        data: { productKeys: { push: key } },
      });
    }
    return ok({ key, ...listing });
  } catch (error) {
    return handleError(error);
  }
}
