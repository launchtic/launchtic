import { NextRequest } from "next/server";
import { db, EventType } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

const PAGE_SIZE = 25;
const TAG_TYPES: EventType[] = [EventType.TAG_ADDED, EventType.TAG_REMOVED];

// Contact activity timeline, cursor-paginated. `kind=tags` returns only the
// tag-change events (drives the "Tag history" tab).
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const r = await requireAccess("contacts:read");
    if (!r.ok) return r.response;

    const { id } = await params;
    const contact = await db.contact.findFirst({ where: { id, workspaceId: r.workspaceId }, select: { id: true } });
    if (!contact) return err("Contact not found", 404);

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const kind = searchParams.get("kind");

    const rows = await db.contactEvent.findMany({
      where: {
        contactId: id,
        ...(kind === "tags" ? { type: { in: TAG_TYPES } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, type: true, data: true, createdAt: true },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    // FORM_SUBMIT events only store funnelStepId — resolve to funnel + step
    // names so the timeline shows "Funnel · Step" instead of a hidden id.
    const stepIds = [
      ...new Set(
        page
          .filter((e) => e.type === "FORM_SUBMIT")
          .map((e) => (e.data as Record<string, unknown> | null)?.funnelStepId)
          .filter((x): x is string => typeof x === "string"),
      ),
    ];
    const steps = stepIds.length
      ? await db.funnelStep.findMany({
          where: { id: { in: stepIds } },
          select: { id: true, name: true, funnel: { select: { name: true } } },
        })
      : [];
    const stepMap = new Map(steps.map((s) => [s.id, { stepName: s.name, funnelName: s.funnel.name }]));

    return ok({
      items: page.map((e) => {
        const data = (e.data as Record<string, unknown> | null) ?? null;
        let enriched = data;
        if (e.type === "FORM_SUBMIT" && data) {
          const meta = stepMap.get(data.funnelStepId as string);
          if (meta) enriched = { ...data, stepName: meta.stepName, funnelName: meta.funnelName };
        }
        return {
          id: e.id,
          type: e.type,
          data: enriched as Record<string, string> | null,
          createdAt: e.createdAt.toISOString(),
        };
      }),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    return handleError(error);
  }
}
