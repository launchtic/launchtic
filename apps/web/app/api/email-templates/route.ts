import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  htmlBody: z.string().min(1),
  category: z.enum(["TRANSACTIONAL", "MARKETING", "SYSTEM"]).default("MARKETING"),
});

export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search") ?? "";

    const where: any = { workspaceId };
    if (category && ["TRANSACTIONAL", "MARKETING", "SYSTEM"].includes(category)) {
      where.category = category;
    }
    if (search) where.name = { contains: search, mode: "insensitive" };

    const templates = await db.emailTemplate.findMany({
      where,
      orderBy: [{ isSystem: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        subject: true,
        category: true,
        isSystem: true,
        systemKey: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return ok(templates);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("emails:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const body = await req.json();
    const data = createSchema.parse(body);

    const template = await db.emailTemplate.create({
      data: { ...data, workspaceId, isSystem: false },
    });

    return ok(template, 201);
  } catch (error) {
    return handleError(error);
  }
}
