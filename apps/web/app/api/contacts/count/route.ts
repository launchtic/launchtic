import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

// Lightweight workspace-level count for header display ("X total contacts").
// Uses unique index (workspaceId, email) — fast even at 1M+ rows.
// NOT for filtered/searched counts (those would scan).
//
// Optional ?tagId=… returns the count of contacts with that tag (used by the
// bulk-enroll-by-tag preview). Costs one indexed lookup on ContactTag.
export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess();
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const tagId = new URL(req.url).searchParams.get("tagId");
    const where = tagId
      ? { workspaceId, tags: { some: { tagId } } }
      : { workspaceId };

    const total = await db.contact.count({ where });
    return ok({ total });
  } catch (error) {
    return handleError(error);
  }
}
