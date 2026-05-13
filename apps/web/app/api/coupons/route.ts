import { NextRequest, NextResponse } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../lib/api";
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
    ...(search && { code: { contains: search, mode: "insensitive" as const } }),
  };

  if (!paginated) {
    const coupons = await db.coupon.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(coupons);
  }

  const page = Math.max(1, parseInt(pageParam ?? "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam ?? "25")));

  const [items, total] = await Promise.all([
    db.coupon.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.coupon.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(req: NextRequest) {
  const r = await requireAccess("orders:write");
  if (!r.ok) return r.response;
  const { workspaceId } = r;

  const { code, type, discount, maxUses, expiresAt } = await req.json();
  if (!code?.trim()) return NextResponse.json({ error: "Code is required" }, { status: 400 });
  if (!type || !["percentage", "fixed"].includes(type)) return NextResponse.json({ error: "Type must be percentage or fixed" }, { status: 400 });
  if (discount === undefined || discount < 0) return NextResponse.json({ error: "Discount is required" }, { status: 400 });
  if (type === "percentage" && (discount < 1 || discount > 100)) return NextResponse.json({ error: "Percentage must be 1–100" }, { status: 400 });

  try {
    const coupon = await db.coupon.create({
      data: {
        workspaceId,
        code: code.trim().toUpperCase(),
        type,
        discount: type === "fixed" ? Math.round(discount * 100) : discount,
        maxUses: maxUses ? parseInt(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    return NextResponse.json(coupon, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Coupon code already exists" }, { status: 409 });
    throw e;
  }
}
