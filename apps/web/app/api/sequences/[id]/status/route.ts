import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { isEmptyEmailDoc } from "@launchtic/email";
import { z } from "zod";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

const schema = z.object({ status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]) });

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("emails:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { id } = await params;
    const { status } = schema.parse(await req.json());

    const existing = await db.emailSequence.findFirst({
      where: { id, workspaceId },
      include: { steps: { select: { id: true, emailSubject: true, emailHtmlBody: true } } },
    });
    if (!existing) return err("Sequence not found", 404);

    if (status === "ACTIVE") {
      if (existing.steps.length === 0) {
        return err("Cannot activate sequence with no steps", 400);
      }
      // Hard validation: every step must have a subject and a non-empty body.
      const issues: string[] = [];
      existing.steps.forEach((s, idx) => {
        if (!s.emailSubject?.trim()) issues.push(`Step ${idx + 1}: subject is required`);
        if (isEmptyEmailDoc(s.emailHtmlBody)) issues.push(`Step ${idx + 1}: body is empty`);
      });
      if (issues.length > 0) {
        return err(`Cannot activate — ${issues.join("; ")}`, 400);
      }
    }

    const updated = await db.emailSequence.update({ where: { id }, data: { status } });
    return ok(updated);
  } catch (error) {
    return handleError(error);
  }
}
