import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

type Props = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Props) {
  const r = await requireAccess("orders:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id } = await params;

  const coupon = await db.coupon.findFirst({ where: { id, workspaceId } });
  if (!coupon) return err("Not found", 404);

  const { code, type, discount, maxUses, expiresAt, active } = await req.json();

  const updated = await db.coupon.update({
    where: { id },
    data: {
      ...(code !== undefined && { code: code.trim().toUpperCase() }),
      ...(type !== undefined && { type }),
      ...(discount !== undefined && {
        discount: type === "fixed" || coupon.type === "fixed"
          ? Math.round(discount * 100)
          : discount,
      }),
      ...(maxUses !== undefined && { maxUses: maxUses ? parseInt(maxUses) : null }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      ...(active !== undefined && { active }),
    },
  });

  return ok(updated);
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const r = await requireAccess("orders:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;
  const { id } = await params;

  const coupon = await db.coupon.findFirst({ where: { id, workspaceId } });
  if (!coupon) return err("Not found", 404);

  await db.coupon.delete({ where: { id } });
  return ok({ deleted: true });
}
