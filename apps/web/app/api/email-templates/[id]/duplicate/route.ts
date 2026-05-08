import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError, getWorkspaceId } from "../../../../../lib/api";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const { id } = await params;
    const source = await db.emailTemplate.findFirst({ where: { id, workspaceId } });
    if (!source) return err("Template not found", 404);

    const copy = await db.emailTemplate.create({
      data: {
        workspaceId,
        name: `${source.name} (copy)`,
        subject: source.subject,
        htmlBody: source.htmlBody,
        category: source.category,
        isSystem: false,
      },
    });

    return ok(copy, 201);
  } catch (error) {
    return handleError(error);
  }
}
