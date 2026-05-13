import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

// Bulk-delete EmailSend rows for the current workspace. Filters mirror the
// list view exactly — "clear what I see":
//   - status:  only delete rows with this status
//   - source:  only delete from a specific source type
//   - range:   "24h" | "7d" | "30d" — only delete rows queued within window
// All filters AND together; omit all to wipe everything.
//
// Caveat: deleting EmailSend rows leaves Broadcast.sentCount/failedCount
// stale (the worker increments them at send time but we don't recompute
// here). We deliberately don't reset those counters — they reflect what was
// actually attempted, which is correct for the broadcast's history even if
// the audit log is purged.

const SOURCES = ["BROADCAST", "TEMPLATE", "AUTOMATION", "SEQUENCE", "TRANSACTIONAL"] as const;

const RANGES_MS: Record<string, number> = {
  "24h": 24 * 3600 * 1000,
  "7d":  7  * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
};

const schema = z.object({
  status: z.enum(["QUEUED", "SENT", "FAILED", "BOUNCED"]).optional(),
  source: z.enum(SOURCES).optional(),
  range:  z.enum(["24h", "7d", "30d"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const r = await requireAccess("emails:write");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    // Empty body = wipe all
    const raw = await req.text();
    const parsed = raw.trim().length > 0 ? schema.parse(JSON.parse(raw)) : {};

    const where: any = { workspaceId };
    if (parsed.status) where.status = parsed.status;
    if (parsed.source) {
      if (parsed.source === "BROADCAST")     where.broadcastId      = { not: null };
      if (parsed.source === "TEMPLATE")      where.templateId       = { not: null };
      if (parsed.source === "AUTOMATION")    where.automationId     = { not: null };
      if (parsed.source === "SEQUENCE")      where.sequenceId       = { not: null };
      if (parsed.source === "TRANSACTIONAL") where.transactionalKey = { not: null };
    }
    if (parsed.range && RANGES_MS[parsed.range]) {
      where.queuedAt = { gte: new Date(Date.now() - RANGES_MS[parsed.range]) };
    }

    const result = await db.emailSend.deleteMany({ where });
    return ok({ deleted: result.count });
  } catch (error) {
    return handleError(error);
  }
}
