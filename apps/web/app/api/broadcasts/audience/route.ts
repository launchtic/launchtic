import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { z } from "zod";
import { ok, err, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

// POST /api/broadcasts/audience  — count recipients matching given targeting,
// without saving. Used by composer UI to show "Send to X contacts" preview.

const schema = z.object({
  targetType: z.enum(["ALL_CONTACTS", "TAG"]),
  targetTagIds: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("broadcasts:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const { targetType, targetTagIds } = schema.parse(await req.json());

    // Mirror the worker: unsubscribed/bounced are always excluded, so the
    // preview count matches what actually gets sent.
    const where: any = { workspaceId, unsubscribedAt: null, bouncedAt: null };
    if (targetType === "TAG" && targetTagIds.length > 0) {
      where.tags = { some: { tagId: { in: targetTagIds } } };
    } else if (targetType === "TAG") {
      // No tags selected → 0 recipients
      return ok({ count: 0 });
    }

    const count = await db.contact.count({ where });
    return ok({ count });
  } catch (error) {
    return handleError(error);
  }
}
