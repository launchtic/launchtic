import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";
import { demoGuard } from "../../../lib/demo";
import { fetchProductFiles } from "../../../lib/products";

export const dynamic = "force-dynamic";

// GET /api/purchases — every saved product key with its current file list.
// A key the server rejects (revoked, typo) still shows, with its error.
export async function GET() {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);

    const org = await db.organization.findUnique({
      where: { id: r.organizationId },
      select: { productKeys: true },
    });
    const purchases = await Promise.all(
      (org?.productKeys ?? []).map(async (key) => {
        try {
          return { key, ...(await fetchProductFiles(key)) };
        } catch (e: any) {
          return { key, error: e?.message ?? "Could not load" };
        }
      }),
    );
    return ok(purchases);
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
    if (!key) return err("Enter a product key", 400);

    let listing;
    try {
      listing = await fetchProductFiles(key);
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

// DELETE /api/purchases?key=… — forget a key. Installed content stays.
export async function DELETE(req: NextRequest) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess();
    if (!r.ok) return r.response;
    if (!r.isOwner) return err("Owner-only", 403);

    const key = req.nextUrl.searchParams.get("key") ?? "";
    const org = await db.organization.findUnique({
      where: { id: r.organizationId },
      select: { productKeys: true },
    });
    await db.organization.update({
      where: { id: r.organizationId },
      data: { productKeys: (org?.productKeys ?? []).filter((k) => k !== key) },
    });
    return ok({ removed: key });
  } catch (error) {
    return handleError(error);
  }
}
