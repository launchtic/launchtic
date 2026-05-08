import { auth } from "../../../../lib/auth";
import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";

type Props = { params: Promise<{ id: string }> };

async function getProduct(id: string, workspaceId: string) {
  const product = await db.physicalProduct.findUnique({ where: { id } });
  if (!product || product.workspaceId !== workspaceId) return null;
  return product;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = (session as any).workspaceId as string;
  const { id } = await params;

  const product = await getProduct(id, workspaceId);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(product);
}

export async function PATCH(req: NextRequest, { params }: Props) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = (session as any).workspaceId as string;
  const { id } = await params;

  const product = await getProduct(id, workspaceId);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updated = await db.physicalProduct.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      description: body.description !== undefined ? body.description : undefined,
      sku: body.sku !== undefined ? body.sku : undefined,
      price: body.price !== undefined ? Math.round(body.price * 100) : undefined,
      currency: body.currency ?? undefined,
      weight: body.weight !== undefined ? body.weight : undefined,
      limitStock: body.limitStock ?? undefined,
      stockLimit: body.stockLimit !== undefined ? body.stockLimit : undefined,
      images: body.images ?? undefined,
      hasOptions: body.hasOptions ?? undefined,
      options: body.options !== undefined ? body.options : undefined,
      variants: body.variants !== undefined ? body.variants : undefined,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = (session as any).workspaceId as string;
  const { id } = await params;

  const product = await getProduct(id, workspaceId);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.physicalProduct.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
