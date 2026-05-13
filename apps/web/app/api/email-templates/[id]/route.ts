import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500).optional(),
  htmlBody: z.string().min(1).optional(),
  category: z.enum(["TRANSACTIONAL", "MARKETING", "SYSTEM"]).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const template = await db.emailTemplate.findFirst({ where: { id, workspaceId } });
    if (!template) return err("Template not found", 404);

    return ok(template);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("emails:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const existing = await db.emailTemplate.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Template not found", 404);

    const body = await req.json();
    const data = updateSchema.parse(body);

    // System templates can be edited but category cannot change
    if (existing.isSystem && data.category && data.category !== existing.category) {
      return err("Cannot change category of system template", 400);
    }

    const template = await db.emailTemplate.update({ where: { id }, data });
    return ok(template);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("emails:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const existing = await db.emailTemplate.findFirst({ where: { id, workspaceId } });
    if (!existing) return err("Template not found", 404);
    if (existing.isSystem) return err("Cannot delete system template", 400);

    await db.emailTemplate.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
