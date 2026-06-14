import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { demoGuard } from "../../../../../lib/demo";

type Params = { params: Promise<{ id: string }> };

// Promote this identity to default. Demotes the previous default in the same
// transaction.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const blocked = demoGuard();
    if (blocked) return blocked;
    const r = await requireAccess("settings:email:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const existing = await db.senderIdentity.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Sender identity not found", 404);

    if (existing.isDefault) return ok(existing); // already default — no-op

    const updated = await db.$transaction(async (tx) => {
      await tx.senderIdentity.updateMany({
        where: { workspaceId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.senderIdentity.update({ where: { id }, data: { isDefault: true } });
    });

    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}
