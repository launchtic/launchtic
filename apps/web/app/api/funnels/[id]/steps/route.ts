import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@launchtic/database";
import { ok, err, handleError } from "../../../../../lib/api";
import { requireAccess } from "../../../../../lib/permissions";
import { defaultPageJson } from "../../../../../lib/default-page-json";
import { generateUniqueSlug } from "../../../../../lib/funnels/slug-validation";

const createStepSchema = z.object({
  name: z.string().min(1).max(100),
  // slug is optional — server auto-generates from name and resolves any
  // collision (within funnel or across the URL space) by appending -2, -3...
  // Manual rename via PATCH still enforces strict 409 on conflict.
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug chỉ dùng chữ thường, số, gạch ngang").optional(),
  type: z.enum(["LANDING", "CHECKOUT", "UPSELL", "DOWNSELL", "THANKYOU", "CUSTOM"]),
});

type Params = { params: Promise<{ id: string }> };

// ─── GET /api/funnels/:id/steps ───────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id: funnelId } = await params;
    const r = await requireAccess("funnels:read");
    if (!r.ok) return r.response;

    const steps = await db.funnelStep.findMany({
      where: { funnelId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        order: true,
        updatedAt: true,
      },
    });

    return ok(steps);
  } catch (error) {
    return handleError(error);
  }
}

// ─── POST /api/funnels/:id/steps ──────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: funnelId } = await params;
    const r = await requireAccess("funnels:write");
    if (!r.ok) return r.response;
    const body = await req.json();
    const data = createStepSchema.parse(body);

    // Verify the funnel exists
    const funnel = await db.funnel.findUnique({
      where: { id: funnelId },
      select: { id: true, workspaceId: true },
    });
    if (!funnel) return err("Funnel not found", 404);

    // Auto-resolve slug: use provided slug as the base when given, otherwise
    // slugify the step name. Either way, suffixes (-2, -3...) are appended
    // until unique within the funnel + URL space.
    const slug = await generateUniqueSlug({
      workspaceId: funnel.workspaceId,
      funnelId,
      baseName: data.slug ?? data.name,
    });

    // Get the next order value
    const lastStep = await db.funnelStep.findFirst({
      where: { funnelId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (lastStep?.order ?? 0) + 1;

    const step = await db.funnelStep.create({
      data: {
        funnelId,
        name: data.name,
        slug,
        type: data.type,
        order: nextOrder,
        pageJson: defaultPageJson, // Empty canvas Craft.js
      },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        order: true,
        createdAt: true,
      },
    });

    return ok(step, 201);
  } catch (error) {
    return handleError(error);
  }
}
