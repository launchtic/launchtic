import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, handleError } from "../../../../lib/api";
import { requireAccess } from "../../../../lib/permissions";

const PAGE_SIZE = 50;

const STATUSES = ["QUEUED", "SENT", "FAILED", "BOUNCED"] as const;
type StatusFilter = (typeof STATUSES)[number];

// Source filter values match EmailSend.sourceType (Pattern B). String column,
// not a DB enum — adding new source types only needs an app-code bump.
const SOURCES = ["BROADCAST", "WORKFLOW", "TEMPLATE", "SYSTEM"] as const;
type SourceFilter = (typeof SOURCES)[number];

const RANGES: Record<string, number> = {
  "24h": 24 * 3600 * 1000,
  "7d":  7  * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
};

export async function GET(req: NextRequest) {
  try {
    const r = await requireAccess("email_logs:read");
    if (!r.ok) return r.response;
    const { workspaceId } = r;

    const url = req.nextUrl;
    const statusParam = url.searchParams.get("status");
    const sourceParam = url.searchParams.get("source");
    const q          = url.searchParams.get("q")?.trim() ?? "";
    const range      = url.searchParams.get("range") ?? "all";
    const cursor     = url.searchParams.get("cursor");

    const where: Record<string, unknown> = { workspaceId };

    if (statusParam && (STATUSES as readonly string[]).includes(statusParam)) {
      where.status = statusParam as StatusFilter;
    }

    if (sourceParam && (SOURCES as readonly string[]).includes(sourceParam)) {
      // Direct equality on sourceType — covered by the
      // (workspaceId, sourceType, queuedAt) index.
      where.sourceType = sourceParam as SourceFilter;
    }

    if (q) {
      where.OR = [
        { toEmail: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
      ];
    }

    if (RANGES[range]) {
      where.queuedAt = { gte: new Date(Date.now() - RANGES[range]) };
    }

    const rows = await db.emailSend.findMany({
      where,
      orderBy: [{ queuedAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        toEmail: true,
        subject: true,
        status: true,
        queuedAt: true,
        sentAt: true,
        failedAt: true,
        sourceType:  true,
        sourceId:    true,
        sourceLabel: true,
        errorMessage: true,
      },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // Pattern B keeps the source label as a snapshot column on EmailSend, so
    // the list endpoint no longer fans out to Broadcast/EmailTemplate/
    // WorkflowEmail tables. Single query — much cheaper for high-volume logs.
    const resolved = items.map((r) => ({
      id: r.id,
      toEmail: r.toEmail,
      subject: r.subject,
      status: r.status,
      queuedAt: r.queuedAt.toISOString(),
      sentAt:   r.sentAt?.toISOString()   ?? null,
      failedAt: r.failedAt?.toISOString() ?? null,
      errorMessage: r.errorMessage,
      sourceType: (r.sourceType ?? "SYSTEM") as SourceFilter,
      sourceName: r.sourceLabel ?? "System",
      sourceId:   r.sourceId,
    }));

    return ok({ items: resolved, nextCursor });
  } catch (error) {
    return handleError(error);
  }
}
