import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const funnel = await db.funnel.findUnique({
      where: { id, workspaceId },
      include: {
        steps: { orderBy: { order: "asc" } },
      },
    });

    if (!funnel) return err("Funnel not found", 404);

    // Currency is locked once monetizable content is attached — surface to UI so the
    // dropdown can be disabled before the user submits and gets a 409 from PATCH.
    const blocker = await db.funnelStep.findFirst({
      where: {
        funnelId: id,
        OR: [
          { physicalProductId: { not: null } },
          { pricePlans: { some: {} } },
          { orderBumps: { some: {} } },
        ],
      },
      select: { id: true },
    });

    return ok({ ...funnel, currencyLocked: !!blocker });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const funnel = await db.funnel.findUnique({ where: { id, workspaceId } });
    if (!funnel) return err("Funnel not found", 404);

    const body = await req.json();
    const data: { name?: string; currency?: string; favicon?: string | null } = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.currency === "string") data.currency = body.currency.toLowerCase();
    if ("favicon" in body) data.favicon = body.favicon ? String(body.favicon).trim() || null : null;

    // Block currency change while monetizable content is attached. Auto-converting amounts
    // is unsafe (¥10,000 ≠ $10,000), and silently leaving stale currencies on plans/products
    // would let checkout charge a different currency than the funnel claims.
    if (data.currency && data.currency !== funnel.currency) {
      const blocker = await db.funnelStep.findFirst({
        where: {
          funnelId: id,
          OR: [
            { physicalProductId: { not: null } },
            { pricePlans: { some: {} } },
            { orderBumps: { some: {} } },
          ],
        },
        select: { id: true },
      });
      if (blocker) {
        return err(
          "Cannot change currency while this funnel still has price plans, order bumps, or physical products attached. Remove them first.",
          409,
        );
      }
    }

    const updated = await db.funnel.update({ where: { id }, data });
    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/funnels/:id
//   default       → move to trash (status = TRASHED). Reversible via /restore.
//   ?permanent=1  → hard delete. Only allowed when funnel is already TRASHED to
//                   prevent accidental permanent loss with one click.
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await requireAccess("funnels:delete");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const funnel = await db.funnel.findUnique({ where: { id, workspaceId } });
    if (!funnel) return err("Funnel not found", 404);

    const permanent = new URL(req.url).searchParams.get("permanent") === "1";

    if (permanent) {
      if (funnel.status !== "TRASHED") {
        return err("Funnel must be moved to trash before permanent deletion.", 409);
      }
      await db.funnel.delete({ where: { id } });
      return ok({ deleted: true, permanent: true });
    }

    await db.funnel.update({
      where: { id },
      data: { status: "TRASHED" },
    });
    return ok({ deleted: true, permanent: false });
  } catch (error) {
    return handleError(error);
  }
}
