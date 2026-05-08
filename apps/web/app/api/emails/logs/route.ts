import { NextRequest } from "next/server";
import { db } from "@launchtic/database";
import { ok, err, handleError, getWorkspaceId } from "../../../../lib/api";

const PAGE_SIZE = 50;

const STATUSES = ["QUEUED", "SENT", "FAILED", "BOUNCED"] as const;
type StatusFilter = (typeof STATUSES)[number];

const SOURCES = ["BROADCAST", "TEMPLATE", "AUTOMATION", "SEQUENCE", "TRANSACTIONAL"] as const;
type SourceFilter = (typeof SOURCES)[number];

const RANGES: Record<string, number> = {
  "24h": 24 * 3600 * 1000,
  "7d":  7  * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
};

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return err("Unauthorized", 401);

    const url = req.nextUrl;
    const statusParam = url.searchParams.get("status");
    const sourceParam = url.searchParams.get("source");
    const q          = url.searchParams.get("q")?.trim() ?? "";
    const range      = url.searchParams.get("range") ?? "all";
    const cursor     = url.searchParams.get("cursor");

    const where: any = { workspaceId };

    if (statusParam && (STATUSES as readonly string[]).includes(statusParam)) {
      where.status = statusParam as StatusFilter;
    }

    if (sourceParam && (SOURCES as readonly string[]).includes(sourceParam)) {
      const s = sourceParam as SourceFilter;
      if (s === "BROADCAST")     where.broadcastId   = { not: null };
      if (s === "TEMPLATE")      where.templateId    = { not: null };
      if (s === "AUTOMATION")    where.automationId  = { not: null };
      if (s === "SEQUENCE")      where.sequenceId    = { not: null };
      if (s === "TRANSACTIONAL") where.transactionalKey = { not: null };
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
        broadcastId: true,
        templateId: true,
        automationId: true,
        sequenceId: true,
        transactionalKey: true,
        errorMessage: true,
      },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // Batch-resolve source names so the list shows "Welcome blast" instead of an ID.
    const broadcastIds  = [...new Set(items.map((r) => r.broadcastId).filter(Boolean))] as string[];
    const templateIds   = [...new Set(items.map((r) => r.templateId).filter(Boolean))] as string[];
    const automationIds = [...new Set(items.map((r) => r.automationId).filter(Boolean))] as string[];
    const sequenceIds   = [...new Set(items.map((r) => r.sequenceId).filter(Boolean))] as string[];

    const [broadcasts, templates, automations, sequences] = await Promise.all([
      broadcastIds.length
        ? db.broadcast.findMany({ where: { id: { in: broadcastIds } }, select: { id: true, name: true } })
        : [],
      templateIds.length
        ? db.emailTemplate.findMany({ where: { id: { in: templateIds } }, select: { id: true, name: true } })
        : [],
      automationIds.length
        ? db.automation.findMany({ where: { id: { in: automationIds } }, select: { id: true, name: true } })
        : [],
      sequenceIds.length
        ? db.emailSequence.findMany({ where: { id: { in: sequenceIds } }, select: { id: true, name: true } })
        : [],
    ]);

    const broadcastMap  = new Map(broadcasts.map((b)  => [b.id, b.name]));
    const templateMap   = new Map(templates.map((t)   => [t.id, t.name]));
    const automationMap = new Map(automations.map((a) => [a.id, a.name]));
    const sequenceMap   = new Map(sequences.map((s)   => [s.id, s.name]));

    const resolved = items.map((r) => {
      let sourceType: SourceFilter = "TRANSACTIONAL";
      let sourceName = r.transactionalKey ?? "Transactional";
      let sourceId: string | null = null;
      if (r.broadcastId) {
        sourceType = "BROADCAST";
        sourceName = broadcastMap.get(r.broadcastId) ?? "(deleted broadcast)";
        sourceId = r.broadcastId;
      } else if (r.sequenceId) {
        sourceType = "SEQUENCE";
        sourceName = sequenceMap.get(r.sequenceId) ?? "(deleted sequence)";
        sourceId = r.sequenceId;
      } else if (r.automationId) {
        sourceType = "AUTOMATION";
        sourceName = automationMap.get(r.automationId) ?? "(deleted automation)";
        sourceId = r.automationId;
      } else if (r.templateId) {
        sourceType = "TEMPLATE";
        sourceName = templateMap.get(r.templateId) ?? "(deleted template)";
        sourceId = r.templateId;
      }

      return {
        id: r.id,
        toEmail: r.toEmail,
        subject: r.subject,
        status: r.status,
        queuedAt: r.queuedAt.toISOString(),
        sentAt:   r.sentAt?.toISOString()   ?? null,
        failedAt: r.failedAt?.toISOString() ?? null,
        errorMessage: r.errorMessage,
        sourceType,
        sourceName,
        sourceId,
      };
    });

    return ok({ items: resolved, nextCursor });
  } catch (error) {
    return handleError(error);
  }
}
