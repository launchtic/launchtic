import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, handleError } from "../../../lib/api";
import { requireAccess } from "../../../lib/permissions";

// Reusable email sections (Craft subtree), stored in SavedBlock with kind="email".
const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  contentJson: z.any(),
});

// GET /api/email-blocks — list this workspace's saved email blocks.
export async function GET() {
  try {
    const r = await requireAccess("email_templates:read");
    if (!r.ok) return r.response;
    const items = await db.savedBlock.findMany({
      where: { workspaceId: r.workspaceId, kind: "email" },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, contentJson: true, createdAt: true },
    });
    return ok({ items });
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/email-blocks  body: { name, contentJson }
export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("email_templates:write");
    if (!r.ok) return r.response;
    const data = createSchema.parse(await req.json());
    const block = await db.savedBlock.create({
      data: { workspaceId: r.workspaceId, name: data.name, kind: "email", contentJson: data.contentJson },
      select: { id: true, name: true, contentJson: true, createdAt: true },
    });
    return ok(block, 201);
  } catch (error) {
    return handleError(error);
  }
}
