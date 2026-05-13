import { db } from "@launchtic/database";
import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "../../../lib/permissions";

export async function GET(req: NextRequest) {
  const r = await requireAccess();
  if (!r.ok) return r.response;
  const { workspaceId } = r;

  const { searchParams } = new URL(req.url);
  const pageParam = searchParams.get("page");
  const pageSizeParam = searchParams.get("pageSize");
  const search = searchParams.get("search") ?? "";
  const paginated = pageParam !== null || pageSizeParam !== null;

  const where = {
    workspaceId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { sku:  { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  if (!paginated) {
    const products = await db.physicalProduct.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(products);
  }

  const page = Math.max(1, parseInt(pageParam ?? "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam ?? "25")));

  const [items, total] = await Promise.all([
    db.physicalProduct.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.physicalProduct.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(req: NextRequest) {
  const r = await requireAccess("funnels:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;

  const body = await req.json();
  const {
    name, description, sku, price, currency,
    tax, taxBehavior, weight,
    limitStock, stockLimit,
    images, hasOptions, options, variants,
  } = body;

  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const product = await db.physicalProduct.create({
    data: {
      workspaceId,
      name,
      description: description ?? null,
      sku: sku ?? null,
      price: price ? Math.round(price * 100) : 0,
      currency: currency ?? "usd",
      weight: weight ?? null,
      limitStock: limitStock ?? false,
      stockLimit: stockLimit ?? null,
      images: images ?? [],
      hasOptions: hasOptions ?? false,
      options: options ?? null,
      variants: variants ?? null,
    },
  });

  return NextResponse.json(product, { status: 201 });
}
