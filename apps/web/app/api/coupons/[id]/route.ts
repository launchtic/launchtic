import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../lib/auth";
import { db } from "@launchtic/database";

type Props = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Props) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = (session as any).workspaceId as string;
  const { id } = await params;

  const coupon = await db.coupon.findFirst({ where: { id, workspaceId } });
  if (!coupon) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = (session as any).workspaceId as string;
  const { id } = await params;

  const coupon = await db.coupon.findFirst({ where: { id, workspaceId } });
  if (!coupon) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.coupon.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
